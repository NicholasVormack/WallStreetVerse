/**
 * Simulated market feed.
 *
 * The Phase 1 rooms model movement and zone routing, not trading. This module
 * gives the demo something to *look* like a trading floor: a deterministic
 * random-walk feed over equities, crypto and the in-game currency, so the
 * ticker and the zone market panels update the way the real feed will.
 *
 * Every price here is generated locally and labelled as simulated in the UI.
 * Nothing in this file pretends to be market data.
 */

export type AssetKind = "equity" | "crypto" | "currency";

export interface Quote {
  readonly symbol: string;
  readonly name: string;
  readonly kind: AssetKind;
  /** Mutable: the feed rewrites this on every step. */
  price: number;
  readonly open: number;
}

interface SymbolSeed {
  readonly symbol: string;
  readonly name: string;
  readonly kind: AssetKind;
  readonly price: number;
  readonly volatility: number;
}

const SEEDS: readonly SymbolSeed[] = [
  { symbol: "SPY", name: "S&P 500 ETF", kind: "equity", price: 512.4, volatility: 0.0007 },
  { symbol: "AAPL", name: "Apple", kind: "equity", price: 189.22, volatility: 0.0011 },
  { symbol: "NVDA", name: "NVIDIA", kind: "equity", price: 121.55, volatility: 0.0019 },
  { symbol: "MSFT", name: "Microsoft", kind: "equity", price: 415.8, volatility: 0.0009 },
  { symbol: "TSLA", name: "Tesla", kind: "equity", price: 248.1, volatility: 0.0024 },
  { symbol: "BTC", name: "Bitcoin", kind: "crypto", price: 63420.55, volatility: 0.0028 },
  { symbol: "ETH", name: "Ethereum", kind: "crypto", price: 3105.44, volatility: 0.0033 },
  { symbol: "SOL", name: "Solana", kind: "crypto", price: 142.18, volatility: 0.0042 },
  { symbol: "DOGE", name: "Dogecoin", kind: "crypto", price: 0.1372, volatility: 0.0061 },
  { symbol: "CRED", name: "Verse Credits", kind: "currency", price: 1.0, volatility: 0.0048 },
];

/** Feed cadence. Four updates a second is enough to read without strobing. */
const STEP_MS = 250;

/** Small deterministic PRNG so a reload looks the same every time. */
const makeRng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const gaussian = (rng: () => number): number => {
  // Box-Muller, clamped so one tick cannot produce an absurd outlier.
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  const value = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(-3, Math.min(3, value));
};

export class Market {
  private readonly quotes: Quote[];
  private readonly volatility: number[];
  private readonly rng: () => number;
  private accumulator = 0;
  private steps = 0;

  constructor(seed = 20261124) {
    this.rng = makeRng(seed);
    this.quotes = SEEDS.map((seedEntry) => ({
      symbol: seedEntry.symbol,
      name: seedEntry.name,
      kind: seedEntry.kind,
      price: seedEntry.price,
      open: seedEntry.price,
    }));
    this.volatility = SEEDS.map((seedEntry) => seedEntry.volatility);

    // Pre-warm so the first visible frame shows movement rather than ten rows of
    // 0.00%. The alternative is a second of dead-looking numbers on load.
    for (let step = 0; step < 40; step += 1) this.step();
  }

  /** Advance the feed by elapsed milliseconds. */
  update(dtMs: number): void {
    this.accumulator += dtMs;
    while (this.accumulator >= STEP_MS) {
      this.accumulator -= STEP_MS;
      this.step();
    }
  }

  private step(): void {
    this.steps += 1;
    for (let index = 0; index < this.quotes.length; index += 1) {
      const quote = this.quotes[index];
      const volatility = this.volatility[index];
      if (!quote || volatility === undefined) continue;
      // A gentle mean reversion keeps the walk from drifting off screen.
      const drift = (quote.open - quote.price) / quote.open * 0.02;
      const shock = gaussian(this.rng) * volatility;
      quote.price = Math.max(quote.open * 0.55, quote.price * (1 + drift + shock));
    }
  }

  get all(): readonly Quote[] {
    return this.quotes;
  }

  get updateCount(): number {
    return this.steps;
  }

  byKind(kind: AssetKind | "all"): readonly Quote[] {
    return kind === "all" ? this.quotes : this.quotes.filter((quote) => quote.kind === kind);
  }

  static changePercent(quote: Quote): number {
    if (quote.open === 0) return 0;
    return ((quote.price - quote.open) / quote.open) * 100;
  }

  static formatPrice(quote: Quote): string {
    const digits = quote.price >= 1000 ? 0 : quote.price >= 1 ? 2 : 4;
    return quote.price.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  static formatChange(quote: Quote): string {
    const change = Market.changePercent(quote);
    const sign = change >= 0 ? "+" : "";
    return `${sign}${change.toFixed(2)}%`;
  }

  /** 0xRRGGBB for a quote's direction, used by the renderer. */
  static changeColor(quote: Quote): number {
    const change = Market.changePercent(quote);
    if (change > 0.05) return 0x2ec4a6;
    if (change < -0.05) return 0xff3b5c;
    return 0x8b98a8;
  }
}
