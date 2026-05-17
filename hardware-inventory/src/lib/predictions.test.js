import {
    analyzeStock,
    buildForecastPrediction,
    buildOnDemandForecastPrediction,
    getStockStatus,
} from './predictions';

describe('prediction helpers', () => {
    const product = {
        id: 'product-1',
        current_stock: 12,
        reorder_point: 10,
        reorder_quantity: 40,
    };

    it('flags critical products when sales imply a near stockout', () => {
        const movements = Array.from({ length: 6 }, () => ({
            product_id: 'product-1',
            movement_type: 'sale',
            quantity: 10,
        }));

        expect(analyzeStock(product, movements)).toMatchObject({
            riskLevel: 'critical',
            shouldReorder: true,
            suggestedQuantity: 40,
            expectedSalesNext7Days: 14,
        });
    });

    it('falls back to reorder point rules when there is no sales history', () => {
        expect(analyzeStock(product, [])).toMatchObject({
            riskLevel: 'ok',
            shouldReorder: false,
        });

        expect(analyzeStock({ ...product, current_stock: 5 }, [])).toMatchObject({
            riskLevel: 'critical',
            shouldReorder: true,
        });
    });

    it('returns stock status labels from current stock', () => {
        expect(getStockStatus({ current_stock: 0, reorder_point: 10 })).toBe('out_of_stock');
        expect(getStockStatus({ current_stock: 4, reorder_point: 10 })).toBe('critical');
        expect(getStockStatus({ current_stock: 8, reorder_point: 10 })).toBe('low');
        expect(getStockStatus({ current_stock: 15, reorder_point: 10 })).toBe('ok');
    });

    it('builds model-driven predictions from forecast rows', () => {
        expect(buildForecastPrediction(product, {
            predicted_daily_demand: 2.5,
            predicted_demand: 35,
            horizon_days: 14,
            safety_stock: 10,
            recommended_reorder_quantity: 60,
            reorder_signal: true,
            model_name: 'sarima',
        })).toMatchObject({
            source: 'forecast',
            modelName: 'sarima',
            shouldReorder: true,
            suggestedQuantity: 60,
            riskLevel: 'at_risk',
            avgDailyConsumption: 2.5,
            expectedSalesNext7Days: 17.5,
        });
    });

    it('builds live model forecasts from actual sale movements', () => {
        const start = new Date('2026-01-01T00:00:00.000Z');
        const movements = Array.from({ length: 70 }, (_, index) => ({
            product_id: 'product-1',
            movement_type: 'sale',
            quantity: index % 7 >= 5 ? 4 : 2,
            created_at: new Date(start.getTime() + index * 86400000).toISOString(),
        }));

        const prediction = buildOnDemandForecastPrediction(product, movements);

        expect(prediction).toMatchObject({
            source: 'model',
            shouldReorder: true,
        });
        expect(['average_demand', 'seasonal_naive', 'holt_winters']).toContain(prediction.modelName);
        expect(prediction.avgDailyConsumption).toBeGreaterThan(0);
        expect(prediction.expectedSalesNext7Days).toBeGreaterThan(0);
        expect(prediction.validationMae).not.toBeNull();
    });

    it('marks products with too little sales history as model forecasts with insufficient history', () => {
        expect(buildOnDemandForecastPrediction(product, [])).toMatchObject({
            source: 'model',
            modelName: 'insufficient_sales_history',
        });
    });
});
