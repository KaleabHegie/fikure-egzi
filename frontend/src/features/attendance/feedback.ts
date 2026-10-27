/** Short confirmation tone (no audio files needed). */
export function beep(ok: boolean) {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = ok ? 880 : 220
    gain.gain.value = 0.08
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.3))
    osc.onended = () => void ctx.close()
    navigator.vibrate?.(ok ? 60 : [80, 60, 80])
  } catch {
    // Sound is a nicety; never block a check-in on it.
  }
}
