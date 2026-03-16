const STORAGE_KEYS = {
  EPHEMERAL_CONTAINERS: 'ephemeralContainers',
  SAVED_CONTAINERS: 'savedContainers',
  GLOBAL_RULES: 'globalRules',
  CONTAINER_RULES: 'containerRules',
  EPHEMERAL_COUNTER: 'ephemeralCounter',
};

// Ordered for maximum contrast between adjacent ephemeral tabs
const CONTAINER_COLORS = [
  'blue', 'orange', 'green', 'pink',
  'turquoise', 'red', 'purple', 'yellow',
];

const CONTAINER_ICONS = [
  'fingerprint', 'briefcase', 'dollar', 'cart',
  'circle', 'gift', 'vacation', 'food',
  'fruit', 'pet', 'tree', 'chill', 'fence',
];

const EPHEMERAL_PREFIX = 'Tmp';

const PENDING_TAB_TIMEOUT_MS = 5000;
