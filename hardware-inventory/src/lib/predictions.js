import { supabase } from './supabase';

/**
 * Analyze stock for a product based on the last 30 days of sales movements.
 * @param {Object} product - Product object from the products table
 * @param {Array}  movements - Array of stock_movements (sales only, last 30 days)
 * @returns {Object} Prediction result
 */
export function analyzeStock(product, movements) {
    const salesMovements = movements.filter(
        (m) => m.movement_type === 'sale' && m.product_id === product.id
    );

    const totalSold = salesMovements.reduce((sum, m) => sum + m.quantity, 0);
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
    } else {
        // No sales data — check against reorder point directly
        if (product.current_stock <= product.reorder_point) {
            riskLevel = product.current_stock <= product.reorder_point / 2 ? 'critical' : 'at_risk';
        }
    }

    const shouldReorder =
        riskLevel === 'critical' ||
        riskLevel === 'at_risk' ||
        product.current_stock <= product.reorder_point;

    const suggestedQuantity = product.reorder_quantity || 50;

    return {
        daysUntilStockout,
        avgDailyConsumption: Math.round(avgDailyConsumption * 100) / 100,
        riskLevel,
        shouldReorder,
        suggestedQuantity,
    };
}

/**
 * Generate a purchase order in Supabase for the given product/prediction.
 * @param {Object} product    - Product object
 * @param {Object} prediction - Result from analyzeStock()
 * @returns {Object} Inserted purchase order or error
 */
export async function generatePurchaseOrder(product, prediction) {
    const orderNumber = `PO-${Date.now()}-${product.sku}`;

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
                notes: `AI generated. Risk: ${prediction.riskLevel}. Avg daily consumption: ${prediction.avgDailyConsumption} units/day.`,
            },
        ])
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Run predictions for all products and auto-generate purchase orders
 * for products that need restocking and don't already have a pending order.
 * @returns {Object} { generated: Array, skipped: Array, errors: Array }
 */
export async function runPredictionsForAllProducts() {
    const generated = [];
    const skipped = [];
    const errors = [];

    // Fetch all products
    const { data: products, error: prodError } = await supabase
        .from('products')
        .select('*');
    if (prodError) throw prodError;

    // Fetch last 30 days of sales movements
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: movements, error: movError } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('movement_type', 'sale')
        .gte('created_at', thirtyDaysAgo.toISOString());
    if (movError) throw movError;

    // Fetch all pending purchase orders to avoid duplicates
    const { data: pendingOrders, error: poError } = await supabase
        .from('purchase_orders')
        .select('product_id')
        .eq('status', 'pending');
    if (poError) throw poError;

    const pendingProductIds = new Set((pendingOrders || []).map((o) => o.product_id));

    // Analyze each product
    for (const product of products) {
        const prediction = analyzeStock(product, movements);

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
        } catch (err) {
            errors.push({ product, prediction, error: err.message });
        }
    }

    return { generated, skipped, errors };
}

/**
 * Get stock status label based on current stock vs reorder point.
 */
export function getStockStatus(product) {
    if (product.current_stock <= 0) return 'out_of_stock';
    if (product.current_stock <= product.reorder_point / 2) return 'critical';
    if (product.current_stock <= product.reorder_point) return 'low';
    return 'ok';
}
