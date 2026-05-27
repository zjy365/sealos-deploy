'use client'

import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'
import { useTasks } from '@/components/app-layout'
import { User } from '@/components/auth/user'
import { GitHubStarsButton } from '@/components/github-stars-button'

interface SharedHeaderProps {
  leftActions?: React.ReactNode
  extraActions?: React.ReactNode
  initialStars?: number
  hideStars?: boolean
  hideUserAction?: boolean
}

export function SharedHeader({
  leftActions,
  extraActions,
  initialStars = 1200,
  hideStars = true,
  hideUserAction = false,
}: SharedHeaderProps) {
  const { toggleSidebar } = useTasks()

  return (
    <div className="px-0 pt-0.5 md:pt-3 pb-1.5 md:pb-4 overflow-visible">
      <div className="flex items-center justify-between gap-2 h-8 min-w-0">
        {/* Left side - Menu Button and Left Actions */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
          <Button onClick={toggleSidebar} variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0">
            <Menu className="h-4 w-4" />
          </Button>
          {leftActions}
        </div>

        {/* Actions - Right side */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {!hideStars && <GitHubStarsButton initialStars={initialStars} />}

          {extraActions}

          {!hideUserAction ? <User /> : null}
        </div>
      </div>
    </div>
  )
}
