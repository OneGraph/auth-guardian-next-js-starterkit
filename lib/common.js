export let isSsr = false

if (typeof window === 'undefined') {
  isSsr = true
}
