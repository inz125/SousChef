import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { toSignInError } from './supabaseAuth'

describe('toSignInError（Supabase の失敗をログイン画面の理由に分ける）', () => {
  it.each([
    [
      new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
      'invalid_credentials',
    ],
    [new AuthApiError('Email not confirmed', 400, 'email_not_confirmed'), 'email_not_confirmed'],
    [new AuthRetryableFetchError('Failed to fetch', 0), 'network'],
    [new TypeError('Load failed'), 'network'],
    [new AuthApiError('Invalid API key', 401, undefined), 'unknown'],
  ])('%s → %s', (error, reason) => {
    expect(toSignInError(error)).toMatchObject({ reason })
  })

  it('想定外の失敗は元のメッセージを持つ', () => {
    expect(toSignInError(new AuthApiError('Invalid API key', 401, undefined)).message).toBe(
      'Invalid API key',
    )
  })
})
