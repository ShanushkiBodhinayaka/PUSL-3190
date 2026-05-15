import { supabase } from './supabase';

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
        avgDailyConsumption: Math.round(avgDailyConsumption * 100) / 100,
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
        avgDailyConsumption: Math.round(predictedDailyDemand * 100) / 100,
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
    const orderNumber = `PO-${Date.now()}-${product.sku}`;
    const notePrefix = prediction.source === 'forecast'
        ? `Model ${prediction.modelName || 'forecast'} generated`
        : 'Heuristic engine generated';

    const { data, error } = await supabase
        .from('purchase_orders')
        .insert([
            {
                order_number: orderNumber,
                product_id: product.id,
                quantity_ordered: prediction.suggestedQuantity,
                status: 'pending',
                triggered_by: 'ai_prediction',
                predicted_days_until_stockout: prediction.daysUntilStockout,
                notes: `${notePrefix}. Risk: ${prediction.riskLevel}. Avg daily demand: ${prediction.avgDailyConsumption} units/day.`,
            },
        ])
        .select()
        .single();

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
            : analyzeStock(product, movements || []);

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
