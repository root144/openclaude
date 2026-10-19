/**
 * duo — free model catalogue (OpenCode + Cline + bridge/FCC).
 *
 * GENERATED FILE — do not edit by hand. Source: config/free-models.json;
 * regenerate with `python3 ops/sync-models.py`. The live probe snapshot is
 * duo/free_status.json; the catalogue is the list of models we are willing to
 * try, with the current primary and fallback order.
 */

/** Verified-cost-zero OpenCode models (provider/model-id). */
export const OC_FREE_MODELS = [
  'opencode/mimo-v2.6-flash-free',
  'opencode/nemotron-3.5-lightning-free',
  'opencode/nemotron-3-ultra-free',
  'opencode/longcat-2.5-preview-free',
  'opencode/big-pickle',
  'orcarouter/z-ai/glm-5.3-flash-free',
  'orcarouter/deepseek/deepseek-v4-flash-free',
  'orcarouter/tencent/hy3-free',
  'zenmux/z-ai/glm-4.7-flash-free',
] as const

/** Verified-cost-zero Cline models (provider/model-id). */
export const CLINE_FREE_MODELS = [
  'cline-free/muse-spark-1.3-contributor',
  'cline-free/mimo-v2.6-flash',
] as const

/** Bridge models verified at cost 0 via FCC (Google AI Studio free tier). */
export const BRIDGE_FREE_MODELS = [
  'anthropic/gemini/models/gemini-3.6-flash',
] as const

/** Probe date of the lists above. */
export const PROBE_DATE = '2026-10-18'

/** Re-probe after this date: free tiers churn. */
export const PROBE_STALE_AFTER = '2026-11-17'

/** Primary model used by launchers, shim and eval defaults. */
export const PRIMARY_FREE_MODEL = 'opencode/big-pickle'

/** Ordered fallbacks for the primary model. */
export const PRIMARY_FALLBACKS = [
  'opencode/mimo-v2.6-flash-free',
  'opencode/nemotron-3.5-lightning-free',
] as const

/** Slow/rate-limited models kept usable via explicit rotation. */
export const RATE_LIMITED_MODELS: ReadonlyArray<readonly [string, string]> = [
  ['opencode/nemotron-3-ultra-free', '120 s without a reply at the 2026-10-16 probe — slow rather than broken; rotate via DUO_MODEL_A_FALLBACKS'],
]

/** Candidates that failed the probe, with their failure mode. */
export const KNOWN_BAD_MODELS: ReadonlyArray<readonly [string, string]> = [
  ['freemodel/*', '401 — requires an API key (`opencode auth`)'],
  ['orcarouter/orcarouter/free', '402 — quota exhausted'],
  ['tokenrouter/z-ai/glm-5.3-free', '503 — unavailable'],
  ['opencode/ling-3.0-flash-fin-free', '400 — invalid model'],
  ['opencode/ling-3.1-flash-free', 'no-route — "Model unavailable", 2026-10-16'],
  ['opencode/fledge-alpha-free', 'no-route — "Model unavailable", 2026-10-16'],
  ['opencode/step-5-preview-free', 'no-route — "Model unavailable", 2026-10-16'],
  ['opencode/cat-jam-free', 'no-route — "Model unavailable", 2026-10-18'],
  ['opencode/space-bunny-free', 'no-route — "Model unavailable", 2026-10-19'],
  ['opencode/muse-spark-1.3-contributor-free', 'no-route — "Model unavailable", 2026-10-18'],
  ['stealth/space-bunny-alpha', 'finish=error at the 2026-10-16 probe (retirement announced)'],
  ['cline-free/deepseek-v4.1-flash', '"model not found" at the 2026-10-16 probe'],
  ['zenmux/anthropic/claude-sonnet-5-free', '404 — "Requested model is not valid"'],
  ['zenmux/moonshotai/kimi-k3-free', '404 — "Requested model is not valid"'],
  ['zenmux/stepfun/step-3.7-flash-free', '404 — "Requested model is not valid"'],
]

export const CLINE_RETIREMENT_WARNING =
  'stealth/space-bunny-alpha (retirement announced 2026-10-05) failed the 2026-10-16 probe — it may return, but do not rely on it'
