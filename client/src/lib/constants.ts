// API URL based on environment
export const API_URL = import.meta.env.VITE_API_URL || 'https://fishcad.com/api';

// Constants for model generation limits
export const MODEL_LIMITS = {
  FREE: 0,        // Free users get 0 generations
  PRO: Infinity,  // Pro users get unlimited generations
  TRIAL: Infinity // Trial users get unlimited generations during the trial
};

// Constants for the application
export const APP_NAME = 'FishCAD';

// Constants for the pricing plans
export const PRICING_PLANS = {
  FREE: 'free',
  PRO_MONTHLY: 'pro-monthly',
  TRIAL: 'trial',
  ENTERPRISE: 'enterprise',
};

// Constants for feature flags
export const FEATURES = {
  MODEL_GENERATION: 'modelGeneration',      // Only for Pro and Trial
  FULL_ASSETS_LIBRARY: 'fullAssetsLibrary', // Only for Pro and Trial
  TRIAL_ACCESS: 'trialAccess',              // one-hour trial for new users
};

// Constants for localStorage keys
export const STORAGE_KEYS = {
  PENDING_IMPORT: 'fishcad_pending_import',
  USER_SETTINGS: 'fishcad_user_settings',
  LAST_MODELS: 'fishcad_last_models',
};