/** Keeps requests pending during the short, verified handover between singleton owners. */
export class DomainTransition {
  active: boolean;
  draining = false;
  proxyInFlight = 0;
  private waiters: (() => void)[] = [];
  constructor(active = true) { this.active = active; }
  get queuedRequests(): number { return this.waiters.length; }
  async waitForHandover(): Promise<void> {
    if (!this.draining) return;
    await new Promise<void>(resolve => this.waiters.push(resolve));
  }
  beginProxy(): void { this.proxyInFlight++; }
  finishProxy(): void { this.proxyInFlight--; }
  requestActivation(markerExists: boolean, sourceRunsRunning: number): boolean {
    if (this.active) return false;
    this.draining = true;
    if (!markerExists || this.proxyInFlight !== 0 || sourceRunsRunning !== 0) return false;
    this.active = true;
    this.release();
    return true;
  }
  resumeProxy(): void { if (!this.active) this.release(); }
  private release(): void {
    this.draining = false;
    const pending = this.waiters;
    this.waiters = [];
    for (const resolve of pending) resolve();
  }
}
