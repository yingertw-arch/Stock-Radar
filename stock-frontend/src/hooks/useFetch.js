import { useState, useEffect, useRef } from 'react'

export function useFetch(fetcher, deps = []) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    setLoading(true)
    setError(null)
    fetcher()
      .then(d  => { if (mounted.current) { setData(d); setLoading(false) } })
      .catch(e => { if (mounted.current) { setError(e.message); setLoading(false) } })
    return () => { mounted.current = false }
  }, deps)   // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error }
}
