import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HORIZON_DAYS = 14;
const WEEKLY_PERIOD = 7;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
}

function dayKey(value: string) {
    return new Date(value).toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

function mean(values: number[]) {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function std(values: number[]) {
    if (values.length <= 1) return 0;
    const avg = mean(values);
    return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

function round(value: number, digits = 2) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function score(actual: number[], forecast: number[]) {
    const errors = actual.map((value, index) => value - forecast[index]);
    return {
        mae: mean(errors.map((value) => Math.abs(value))),
        rmse: Math.sqrt(mean(errors.map((value) => value ** 2))),
        mape: mean(actual.map((value, index) => Math.abs((value - forecast[index]) / (value || 1)))) * 100,
    };
}

function averageForecast(train: number[], horizon: number) {
    return Array.from({ length: horizon }, () => mean(train));
}

function seasonalNaive(train: number[], horizon: number) {
    const tail = train.slice(-WEEKLY_PERIOD);
    if (tail.length === 0) return Array.from({ length: horizon }, () => 0);
    return Array.from({ length: horizon }, (_, index) => tail[index % tail.length]);
}

function holtWinters(train: number[], horizon: number, alpha: number, beta: number, gamma: number) {
    if (train.length < WEEKLY_PERIOD * 2) return averageForecast(train, horizon);

    let level = mean(train.slice(0, WEEKLY_PERIOD));
    let trend = (mean(train.slice(WEEKLY_PERIOD, WEEKLY_PERIOD * 2)) - level) / WEEKLY_PERIOD;
    const seasonal = Array.from({ length: WEEKLY_PERIOD }, (_, index) => train[index] - level);

    for (let index = 0; index < train.length; index += 1) {
        const seasonIndex = index % WEEKLY_PERIOD;
        const value = train[index];
        const previousLevel = level;
        level = alpha * (value - seasonal[seasonIndex]) + (1 - alpha) * (level + trend);
        trend = beta * (level - previousLevel) + (1 - beta) * trend;
        seasonal[seasonIndex] = gamma * (value - level) + (1 - gamma) * seasonal[seasonIndex];
    }

    return Array.from({ length: horizon }, (_, index) => {
        const step = index + 1;
        const seasonIndex = (train.length + index) % WEEKLY_PERIOD;
        return Math.max(0, level + step * trend + seasonal[seasonIndex]);
    });
}

function chooseBestModel(series: number[], horizon: number) {
    const validationHorizon = Math.min(horizon, Math.max(3, Math.floor(series.length / 3)));
    const train = series.slice(0, -validationHorizon);
    const actual = series.slice(-validationHorizon);
    const candidates: Array<{
        name: string;
        parameters: Record<string, number> | null;
        forecast: number[];
        refit: () => number[];
    }> = [
        {
            name: 'average_demand',
            parameters: null,
            forecast: averageForecast(train, validationHorizon),
            refit: () => averageForecast(series, horizon),
        },
    ];

    if (train.length >= WEEKLY_PERIOD) {
        candidates.push({
            name: 'seasonal_naive',
            parameters: null,
            forecast: seasonalNaive(train, validationHorizon),
            refit: () => seasonalNaive(series, horizon),
        });
    }

    if (train.length >= WEEKLY_PERIOD * 4) {
        for (const [alpha, beta, gamma] of [
            [0.2, 0.1, 0.1],
            [0.4, 0.1, 0.1],
            [0.4, 0.2, 0.2],
            [0.6, 0.2, 0.2],
            [0.8, 0.2, 0.3],
        ]) {
            candidates.push({
                name: 'holt_winters',
                parameters: { alpha, beta, gamma },
                forecast: holtWinters(train, validationHorizon, alpha, beta, gamma),
                refit: () => holtWinters(series, horizon, alpha, beta, gamma),
            });
        }
    }

    return candidates
        .map((candidate) => ({ ...candidate, ...score(actual, candidate.forecast) }))
        .reduce((best, candidate) => (candidate.mae < best.mae ? candidate : best));
}

function buildSeries(productId: string, movements: Record<string, unknown>[]) {
    const sales = movements
        .filter((movement) => movement.product_id === productId)
        .map((movement) => ({
            date: String(movement.created_at),
            quantity: Number(movement.quantity || 0),
        }))
        .filter((movement) => movement.quantity > 0)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (sales.length === 0) return { series: [], historyStart: null, historyEnd: null };

    const totalsByDay = new Map<string, number>();
    for (const sale of sales) {
        const key = dayKey(sale.date);
        totalsByDay.set(key, (totalsByDay.get(key) || 0) + sale.quantity);
    }

    const start = new Date(`${dayKey(sales[0].date)}T00:00:00.000Z`);
    const end = new Date(`${dayKey(sales[sales.length - 1].date)}T00:00:00.000Z`);
    const series: number[] = [];
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
        series.push(totalsByDay.get(dayKey(cursor)) || 0);
    }

    return { series, historyStart: dayKey(sales[0].date), historyEnd: dayKey(sales[sales.length - 1].date) };
}

function buildForecastRow(product: Record<string, unknown>, movements: Record<string, unknown>[], runDate: string) {
    const { series, historyStart, historyEnd } = buildSeries(String(product.id), movements);
    const currentStock = Number(product.current_stock || 0);
    const reorderPoint = Number(product.reorder_point || 0);
    const reorderQuantity = Number(product.reorder_quantity || 1);

    let modelName = 'insufficient_sales_history';
    let parameters = null;
    let forecast = averageForecast(series.slice(-30), HORIZON_DAYS);
    let validation = { mae: null, rmse: null, mape: null };

    if (series.length >= 4 && !series.every((value) => value === 0)) {
        const best = chooseBestModel(series, HORIZON_DAYS);
        modelName = best.name;
        parameters = best.parameters;
        forecast = best.refit().map((value: number) => Math.max(0, value));
        validation = { mae: round(best.mae, 4), rmse: round(best.rmse, 4), mape: round(best.mape, 4) };
    }

    const predictedDemand = forecast.reduce((sum, value) => sum + value, 0);
    const predictedDailyDemand = predictedDemand / HORIZON_DAYS;
    const safetyStock = Math.max(
        reorderPoint,
        Math.ceil(1.65 * Math.max(std(series.slice(-28)), 0.5) * Math.sqrt(HORIZON_DAYS)),
    );
    const projectedStock = currentStock - predictedDemand;
    const recommendedQuantity = Math.max(
        1,
        Math.round(Math.max(reorderQuantity, predictedDemand + safetyStock - currentStock)),
    );

    return {
        product_id: product.id,
        model_name: modelName,
        training_data_source: 'stock_movements',
        history_start: historyStart,
        history_end: historyEnd,
        forecast_date: runDate,
        horizon_days: HORIZON_DAYS,
        predicted_demand: round(predictedDemand, 2),
        predicted_daily_demand: round(predictedDailyDemand, 4),
        safety_stock: safetyStock,
        recommended_reorder_quantity: recommendedQuantity,
        reorder_signal: projectedStock <= safetyStock || currentStock <= reorderPoint,
        validation_mae: validation.mae,
        validation_rmse: validation.rmse,
        validation_mape: validation.mape,
        generated_at: new Date().toISOString(),
        metadata: {
            source: 'edge_live',
            projected_stock: round(projectedStock, 2),
            history_days: series.length,
            model_parameters: parameters,
        },
    };
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

        if (!supabaseUrl || !serviceRoleKey || !anonKey) {
            return jsonResponse({ error: 'Missing required Supabase environment variables.' }, 500);
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return jsonResponse({ error: 'Missing authorization header.' }, 401);

        const userClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
        });
        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        const { data: { user }, error: authError } = await userClient.auth.getUser();
        if (authError || !user) return jsonResponse({ error: 'Unauthorized.' }, 401);

        const { data: profile, error: profileError } = await adminClient
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profileError || !['admin', 'inventory_manager'].includes(profile?.role)) {
            return jsonResponse({ error: 'Only admins and inventory managers can generate forecasts.' }, 403);
        }

        const runDate = todayIsoDate();
        const historyStart = new Date();
        historyStart.setUTCDate(historyStart.getUTCDate() - 365);

        const [{ data: products, error: productError }, { data: movements, error: movementError }] = await Promise.all([
            adminClient.from('products').select('*').eq('active', true).order('name'),
            adminClient
                .from('stock_movements')
                .select('product_id, movement_type, quantity, created_at')
                .eq('movement_type', 'sale')
                .gte('created_at', historyStart.toISOString())
                .order('created_at', { ascending: true })
                .range(0, 49999),
        ]);

        if (productError) return jsonResponse({ error: productError.message }, 400);
        if (movementError) return jsonResponse({ error: movementError.message }, 400);

        const rows = (products || []).map((product: Record<string, unknown>) =>
            buildForecastRow(product, movements || [], runDate)
        );

        const { error: insertError } = await adminClient
            .from('demand_forecasts')
            .upsert(rows, { onConflict: 'product_id,forecast_date' });
        if (insertError) return jsonResponse({ error: insertError.message }, 400);

        return jsonResponse({
            ok: true,
            forecast_date: runDate,
            generated: rows.length,
            reorder_count: rows.filter((row) => row.reorder_signal).length,
        });
    } catch (error) {
        return jsonResponse({ error: error.message || 'Unexpected error.' }, 500);
    }
});
