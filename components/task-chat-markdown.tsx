'use client'

import { Children, isValidElement, memo } from 'react'
import { Streamdown, type Components } from 'streamdown'
import { cn } from '@/lib/utils'

interface TaskChatMarkdownProps {
  content: string
  className?: string
  size?: 'xs' | 'sm'
  tone?: 'default' | 'inverse'
}

function filterRenderableChildren(children: React.ReactNode) {
  return Children.toArray(children).filter((child) => typeof child === 'string' || isValidElement(child))
}

export const TaskChatMarkdown = memo(function TaskChatMarkdown({
  content,
  className,
  size = 'sm',
  tone = 'default',
}: TaskChatMarkdownProps) {
  const textClassName = size === 'xs' ? 'text-xs' : 'text-sm'
  const isInverse = tone === 'inverse'
  const components = {
    a: ({ children, href, ...props }) => (
      <a
        href={typeof href === 'string' ? href : undefined}
        target="_blank"
        rel="noopener noreferrer"
        className={cn('underline-offset-4 hover:underline', isInverse ? 'text-primary-foreground/85' : 'text-primary')}
        {...props}
      >
        {children}
      </a>
    ),
    code: ({ className: nextClassName, children, ...props }) => (
      <code
        className={cn(
          'rounded px-1.5 py-0.5 font-mono text-[0.9em]',
          isInverse ? 'bg-white/15 text-primary-foreground' : 'bg-muted',
          textClassName,
          typeof nextClassName === 'string' ? nextClassName : undefined,
        )}
        {...props}
      >
        {children}
      </code>
    ),
    li: ({ children, ...props }) => (
      <li className={cn('mb-1', textClassName)} {...props}>
        {filterRenderableChildren(children)}
      </li>
    ),
    ol: ({ children, ...props }) => (
      <ol className={cn('ml-5 list-decimal space-y-1', textClassName)} {...props}>
        {children}
      </ol>
    ),
    p: ({ children, ...props }) => (
      <p className={cn('whitespace-pre-wrap break-words', textClassName)} {...props}>
        {filterRenderableChildren(children)}
      </p>
    ),
    pre: ({ children, ...props }) => (
      <pre
        className={cn(
          'overflow-x-auto rounded-lg border p-3 font-mono text-[0.85em] leading-6',
          isInverse ? 'border-white/10 bg-black/20 text-primary-foreground' : 'bg-muted/70',
          textClassName,
        )}
        {...props}
      >
        {children}
      </pre>
    ),
    ul: ({ children, ...props }) => (
      <ul className={cn('ml-5 list-disc space-y-1', textClassName)} {...props}>
        {children}
      </ul>
    ),
  } satisfies Components

  return (
    <div className={cn(textClassName, 'leading-6 text-inherit', className)}>
      <Streamdown components={components} mode="streaming">
        {content}
      </Streamdown>
    </div>
  )
})
