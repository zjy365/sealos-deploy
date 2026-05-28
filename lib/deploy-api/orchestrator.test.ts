import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DeployError } from './types'
import { deployErrorEventFromUnknown } from './error-event'

test('deployErrorEventFromUnknown preserves DeployError message for SSE clients', () => {
  assert.deepEqual(
    deployErrorEventFromUnknown(new DeployError('build_failed', 'building', 'GHCR push failed with 403 Forbidden'), {
      currentPhase: 'generating_yaml',
    }),
    {
      code: 'build_failed',
      message: 'GHCR push failed with 403 Forbidden',
      phase: 'building',
    },
  )
})
