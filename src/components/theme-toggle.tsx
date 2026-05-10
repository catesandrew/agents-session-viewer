'use client'

import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const currentTheme = mounted ? (resolvedTheme ?? theme) : undefined
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark'

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        if (!mounted) return
        setTheme(nextTheme)
      }}
      className="h-9 w-9"
      title={mounted ? `Switch to ${nextTheme} mode` : 'Toggle theme'}
      disabled={!mounted}
    >
      {currentTheme === 'dark' ? (
        <Sun className="w-4 h-4 mr-2" />
      ) : (
        <Moon className="w-4 h-4 mr-2" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
