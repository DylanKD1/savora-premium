/**
 * Shared menu prices — single source of truth for server-side price validation.
 * Used by both routes/orders.js and routes/stripe.js.
 */
const MENU_PRICES = {
  'm-wiener': 22.9, 'm-jaeger': 23.9, 'm-sauerbraten': 26.9,
  'm-rouladen': 27.5, 'm-haxe': 24.9, 'm-zwiebelrostbraten': 29.9,
  'm-bratwurst': 14.9, 'm-currywurst': 13.5, 'm-flammkuchen': 16.9,
  'm-maultaschen': 18.9, 'm-sauerkraut': 5.5, 'm-kartoffelsalat': 6.5,
  'm-spaetzle': 8.5, 'm-bratkartoffeln': 6.5, 'm-rotkohl': 5.5,
  'd-strudel': 8.9, 'd-schwarzwald': 9.5, 'd-rotegruetze': 7.9,
  'd-pilsner': 4.9, 'd-helles': 5.2, 'd-weizen': 5.5, 'd-radler': 4.5
};

/**
 * Validate and resolve cart items against trusted prices.
 * Returns { resolvedItems, subtotal } or throws on unknown item.
 */
function resolveItems(items) {
  const resolvedItems = [];
  for (const item of items) {
    const serverPrice = MENU_PRICES[item.id];
    if (!serverPrice) {
      throw new Error(`Unknown menu item: ${item.id}`);
    }
    resolvedItems.push({
      id: item.id,
      name: item.name || item.id,
      qty: item.qty,
      price: serverPrice
    });
  }
  const subtotal = resolvedItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
  return { resolvedItems, subtotal };
}

module.exports = { MENU_PRICES, resolveItems };
