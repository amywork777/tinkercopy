// API URL based on environment
export const API_URL = import.meta.env.VITE_API_URL || 'https://fishcad.com/api';

// Constants for model generation limits
export const MODEL_LIMITS = {
  FREE: 2,
  PRO: 20,
};

// Constants for the application
export const APP_NAME = 'FishCAD';

// Constants for the pricing plans
export const PRICING_PLANS = {
  FREE: 'free',
  PRO_MONTHLY: 'pro-monthly',
  PRO_ANNUAL: 'pro-annual',
  ENTERPRISE: 'enterprise',
};

// Constants for feature flags
export const FEATURES = {
  MODEL_GENERATION: 'modelGeneration',
  FULL_ASSETS_LIBRARY: 'fullAssetsLibrary',
  PRINT_DISCOUNT: 'printDiscount',
};

// Constants for localStorage keys
export const STORAGE_KEYS = {
  PENDING_IMPORT: 'fishcad_pending_import',
  USER_SETTINGS: 'fishcad_user_settings',
  LAST_MODELS: 'fishcad_last_models',
}; 