import { supabase } from './supabase';

const FORECAST_HORIZON_DAYS = 14;
const WEEKLY_SEASONAL_PERIOD = 7;

function round(value, digits = 2) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function mean(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
    if (values.length <= 1) return 0;
    const avg = mean(values);
    const variance = mean(values.map((value) => (value - avg) ** 2));
    return Math.sqrt(variance);
}

function dateKey(value) {
    return new Date(value).toISOString().slice(0, 10);
}

function addDays(date, days) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

function buildDailySalesSeries(product, movements) {
    const sales = (movements || [])
        .filter((movement) => movement.product_id === product.id && movement.movement_type === 'sale')
        .map((movement) => ({
            date: new Date(movement.created_at || Date.now()),
            quantity: Number(movement.quantity || 0),
        }))
        .filter((movement) => !Number.isNaN(movement.date.getTime()) && movement.quantity > 0)
        .sort((a, b) => a.date - b.date);

    if (sales.length === 0) return [];

    const totalsByDay = new Map();
    for (const sale of sales) {
        const key = dateKey(sale.date);
        totalsByDay.set(key, (totalsByDay.get(key) || 0) + sale.quantity);
    }

    const start = new Date(`${dateKey(sales[0].date)}T00:00:00.000Z`);
    const end = new Date(`${dateKey(sales[sales.length - 1].date)}T00:00:00.000Z`);
    const series = [];
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
        series.push(totalsByDay.get(dateKey(cursor)) || 0);
    }
    return series;
}

function scoreForecast(actual, forecast) {
    const errors = actual.map((value, index) => value - forecast[index]);
    const mae = mean(errors.map((value) => Math.abs(value)));
    const rmse = Math.sqrt(mean(errors.map((value) => value ** 2)));
    const mape = mean(actual.map((value, index) => Math.abs((value - forecast[index]) / (value || 1)))) * 100;
    return { mae, rmse, mape };
}

function averageDemandForecast(train, horizon) {
    return Array.from({ length: horizon }, () => mean(train));
}

function seasonalNaiveForecast(train, horizon, period = WEEKLY_SEASONAL_PERIOD) {
    const tail = train.slice(-period);
    if (tail.length === 0) return Array.from({ length: horizon }, () => 0);
    return Array.from({ length: horizon }, (_, index) => tail[index % tail.length]);
}

function holtWintersForecast(train, horizon, options = {}) {
    const period = options.period || WEEKLY_SEASONAL_PERIOD;
    const alpha = options.alpha ?? 0.4;
    const beta = options.beta ?? 0.1;
    const gamma = options.gamma ?? 0.1;

    if (train.length < period * 2) {
        return averageDemandForecast(train, horizon);
    }

    let level = mean(train.slice(0, period));
    let trend = (mean(train.slice(period, period * 2)) - level) / period;
    const seasonal = Array.from({ length: period }, (_, index) => train[index] - level);

    for (let index = 0; index < train.length; index += 1) {
        const seasonIndex = index % period;
        const value = train[index];
        const previousLevel = level;
        level = alpha * (value - seasonal[seasonIndex]) + (1 - alpha) * (level + trend);
        trend = beta * (level - previousLevel) + (1 - beta) * trend;
        seasonal[seasonIndex] = gamma * (value - level) + (1 - gamma) * seasonal[seasonIndex];
    }

    return Array.from({ length: horizon }, (_, index) => {
        const step = index + 1;
        const seasonIndex = (train.length + index) % period;
        return Math.max(0, level + step * trend + seasonal[seasonIndex]);
    });
}

function chooseBestOnDemandModel(series, horizon = FORECAST_HORIZON_DAYS) {
    const validationHorizon = Math.min(horizon, Math.max(3, Math.floor(series.length / 3)));
    const train = series.slice(0, -validationHorizon);
    const actual = series.slice(-validationHorizon);
    const candidates = [
        {
            name: 'average_demand',
            forecast: averageDemandForecast(train, validationHorizon),
            refit: () => averageDemandForecast(series, horizon),
        },
    ];

    if (train.length >= WEEKLY_SEASONAL_PERIOD) {
        candidates.push({
            name: 'seasonal_naive',
            forecast: seasonalNaiveForecast(train, validationHorizon),
            refit: () => seasonalNaiveForecast(series, horizon),
        });
    }

    if (train.length >= WEEKLY_SEASONAL_PERIOD * 4) {
        const parameterGrid = [
            [0.2, 0.1, 0.1],
            [0.4, 0.1, 0.1],
            [0.4, 0.2, 0.2],
            [0.6, 0.2, 0.2],
            [0.8, 0.2, 0.3],
        ];
        for (const [alpha, beta, gamma] of parameterGrid) {
            candidates.push({
                name: `holt_winters`,
                forecast: holtWintersForecast(train, validationHorizon, { alpha, beta, gamma }),
                refit: () => holtWintersForecast(series, horizon, { alpha, beta, gamma }),
                parameters: { alpha, beta, gamma },
            });
        }
    }

    const scored = candidates.map((candidate) => ({
        ...candidate,
        ...scoreForecast(actual, candidate.forecast),
    }));

    return scored.reduce((best, candidate) => (candidate.mae < best.mae ? candidate : best), scored[0]);
}

export function buildOnDemandForecastPrediction(product, movements, horizon = FORECAST_HORIZON_DAYS) {
    const series = buildDailySalesSeries(product, movements);

    if (series.length < 4 || series.every((value) => value === 0)) {
        const fallback = analyzeStock(product, movements);
        return {
            ...fallback,
            source: 'model',
            modelName: 'insufficient_sales_history',
            horizonDays: horizon,
            validationMae: null,
            validationRmse: null,
            validationMape: null,
        };
    }

    const best = chooseBestOnDemandModel(series, horizon);
    const forecast = best.refit().map((value) => Math.max(0, value));
    const predictedDemand = forecast.reduce((sum, value) => sum + value, 0);
    const predictedDailyDemand = predictedDemand / horizon;
    const recentVolatility = standardDeviation(series.slice(-28));
    const safetyStock = Math.max(
        Number(product.reorder_point || 0),
        Math.ceil(1.65 * Math.max(recentVolatility, 0.5) * Math.sqrt(horizon))
    );
    const projectedStock = Number(product.current_stock || 0) - predictedDemand;
    const daysUntilStockout = predictedDailyDemand > 0
        ? Math.floor(Number(product.current_stock || 0) / predictedDailyDemand)
        : null;

    let riskLevel = 'ok';
    if (projectedStock <= safetyStock || Number(product.current_stock || 0) <= safetyStock) {
        riskLevel = projectedStock <= safetyStock / 2 || Number(product.current_stock || 0) <= safetyStock / 2
            ? 'critical'
            : 'at_risk';
    } else if (daysUntilStockout != null && daysUntilStockout < horizon) {
        riskLevel = daysUntilStockout < 7 ? 'critical' : 'at_risk';
    }

    const suggestedQuantity = Math.max(
        1,
        Math.round(Math.max(
            Number(product.reorder_quantity || 1),
            predictedDemand + safetyStock - Number(product.current_stock || 0)
        ))
    );

    return {
        source: 'model',
        modelName: best.name,
        modelParameters: best.parameters || null,
        horizonDays: horizon,
        daysUntilStockout,
        avgDailyConsumption: round(predictedDailyDemand, 2),
        expectedSalesNext7Days: round(predictedDailyDemand * 7, 1),
        predictedDemand: round(predictedDemand, 2),
        safetyStock,
        projectedStock: round(projectedStock, 2),
        riskLevel,
        shouldReorder: riskLevel === 'critical' || riskLevel === 'at_risk' || Number(product.current_stock || 0) <= Number(product.reorder_point || 0),
        suggestedQuantity,
        validationMae: round(best.mae, 4),
        validationRmse: round(best.rmse, 4),
        validationMape: round(best.mape, 4),
        historyDays: series.length,
    };
}

/**
 * Analyze stock from the last 30 days of sales history.
 * This is used when no trained forecast is available.
 */
export function analyzeStock(product, movements) {
    const salesMovements = movements.filter(
        (movement) => movement.movement_type === 'sale' && movement.product_id === product.id
    );

    const totalSold = salesMovements.reduce((sum, movement) => sum + movement.quantity, 0);
    const avgDailyConsumption = totalSold / 30;
    const roundedAvgDailyConsumption = Math.round(avgDailyConsumption * 100) / 100;
    const expectedSalesNext7Days = Math.round(avgDailyConsumption * 7 * 10) / 10;

    let daysUntilStockout = null;
    let riskLevel = 'ok';

    if (avgDailyConsumption > 0) {
        daysUntilStockout = Math.floor(product.current_stock / avgDailyConsumption);

        if (daysUntilStockout < 7) {
            riskLevel = 'critical';
        } else if (daysUntilStockout < 14) {
            riskLevel = 'at_risk';
        }
    } else if (product.current_stock <= product.reorder_point) {
        riskLevel = product.current_stock <= product.reorder_point / 2 ? 'critical' : 'at_risk';
    }

    const shouldReorder =
        riskLevel === 'critical' ||
        riskLevel === 'at_risk' ||
        product.current_stock <= product.reorder_point;

    return {
        source: 'heuristic',
        daysUntilStockout,
        avgDailyConsumption: roundedAvgDailyConsumption,
        expectedSalesNext7Days,
        riskLevel,
        shouldReorder,
        suggestedQuantity: product.reorder_quantity || 50,
    };
}

export function buildForecastPrediction(product, forecast) {
    const predictedDailyDemand = Number(forecast.predicted_daily_demand || 0);
    const predictedDemand = Number(forecast.predicted_demand || 0);
    const safetyStock = Number(forecast.safety_stock || 0);
    const recommendedQuantity = Number(forecast.recommended_reorder_quantity || product.reorder_quantity || 0);

    const effectiveDemand = Math.max(predictedDailyDemand, predictedDemand / Math.max(Number(forecast.horizon_days || 1), 1));
    const daysUntilStockout = effectiveDemand > 0 ? Math.floor(product.current_stock / effectiveDemand) : null;
    const roundedEffectiveDemand = Math.round(effectiveDemand * 100) / 100;
    const expectedSalesNext7Days = Math.round(effectiveDemand * 7 * 10) / 10;

    let riskLevel = 'ok';
    if (forecast.reorder_signal || product.current_stock <= safetyStock) {
        riskLevel = product.current_stock <= safetyStock ? 'critical' : 'at_risk';
    } else if (daysUntilStockout != null && daysUntilStockout < 14) {
        riskLevel = daysUntilStockout < 7 ? 'critical' : 'at_risk';
    }

    return {
        source: 'forecast',
        modelName: forecast.model_name,
        daysUntilStockout,
        avgDailyConsumption: roundedEffectiveDemand,
        expectedSalesNext7Days,
        riskLevel,
        shouldReorder: Boolean(forecast.reorder_signal) || product.current_stock <= safetyStock,
        suggestedQuantity: Math.max(1, Math.round(recommendedQuantity || product.reorder_quantity || 1)),
        forecast,
    };
}

async function fetchLatestForecasts() {
    const { data, error } = await supabase
        .from('demand_forecasts')
        .select('*')
        .order('generated_at', { ascending: false });

    if (error) throw error;

    const latestByProduct = new Map();
    for (const forecast of data || []) {
        if (!latestByProduct.has(forecast.product_id)) {
            latestByProduct.set(forecast.product_id, forecast);
        }
    }
    return latestByProduct;
}

/**
 * Create a purchase order for the supplied product and reorder decision.
 */
export async function generatePurchaseOrder(product, prediction) {
    const notePrefix = ['forecast', 'model'].includes(prediction.source)
        ? `Model ${prediction.modelName || 'forecast'} generated`
        : 'Heuristic engine generated';

    const { data, error } = await supabase.rpc('place_forecast_purchase_orders', {
        p_items: [
            {
                product_id: product.id,
                quantity: prediction.suggestedQuantity,
                predicted_days_until_stockout: prediction.daysUntilStockout,
                notes: `${notePrefix}. Risk: ${prediction.riskLevel}. Expected 7-day sales: ${prediction.expectedSalesNext7Days} units. Avg daily demand: ${prediction.avgDailyConsumption} units/day.`,
            },
        ],
    });

    if (error) throw error;
    return data;
}

/**
 * Evaluate reorder needs for all products and create purchase orders
 * for items that need restocking and do not already have a pending order.
 */
export async function runPredictionsForAllProducts() {
    const generated = [];
    const skipped = [];
    const errors = [];

    const { data: products, error: productError } = await supabase.from('products').select('*');
    if (productError) throw productError;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
        { data: movements, error: movementError },
        { data: pendingOrders, error: orderError },
        latestForecasts,
    ] = await Promise.all([
        supabase
            .from('stock_movements')
            .select('*')
            .eq('movement_type', 'sale')
            .gte('created_at', thirtyDaysAgo.toISOString()),
        supabase
            .from('purchase_orders')
            .select('product_id')
            .eq('status', 'pending'),
        fetchLatestForecasts(),
    ]);

    if (movementError) throw movementError;
    if (orderError) throw orderError;

    const pendingProductIds = new Set((pendingOrders || []).map((order) => order.product_id));

    for (const product of products || []) {
        const forecast = latestForecasts.get(product.id);
        const prediction = forecast
            ? buildForecastPrediction(product, forecast)
            : buildOnDemandForecastPrediction(product, movements || []);

        if (!prediction.shouldReorder) {
            skipped.push({ product, prediction });
            continue;
        }

        if (pendingProductIds.has(product.id)) {
            skipped.push({ product, prediction, reason: 'already_pending' });
            continue;
        }

        try {
            const order = await generatePurchaseOrder(product, prediction);
            generated.push({ product, prediction, order });
        } catch (error) {
            errors.push({ product, prediction, error: error.message });
        }
    }

    return { generated, skipped, errors };
}

export function getStockStatus(product) {
    if (product.current_stock <= 0) return 'out_of_stock';
    if (product.current_stock <= product.reorder_point / 2) return 'critical';
    if (product.current_stock <= product.reorder_point) return 'low';
    return 'ok';
}
