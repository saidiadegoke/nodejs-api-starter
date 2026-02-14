/**
 * Block types that count as "e-commerce" for has_ecommerce and dashboard Products.
 * Any block with type or componentId in this list triggers e-commerce sync on template save.
 */
const ECOMMERCE_BLOCK_TYPES = [
  'product-grid',
  'products',
  'store',
  'featured-products',
  'product-detail',
  'product-card',
  'cart',
  'checkout',
  'services-list',
];

/**
 * @param {string} blockType
 * @returns {boolean}
 */
function isEcommerceBlockType(blockType) {
  if (!blockType || typeof blockType !== 'string') return false;
  return ECOMMERCE_BLOCK_TYPES.includes(blockType);
}

module.exports = {
  ECOMMERCE_BLOCK_TYPES,
  isEcommerceBlockType,
};
