import { compileWorkflow } from './model.js'

// Whole-flow handoff: DSH owns execution and its normal permission/approval UI.
export async function submitWorkflow(sessions, sessionId, flow, signal) {
  const text = compileWorkflow(flow)
  signal.throwIfAborted()
  if (!sessionId) throw new Error('请先选择或新建一个 DSH 会话')
  const reference = sessions.retain(sessionId, { source: 'workflowBuilder', signal })
  let submission
  try {
    const { session } = await reference.ready
    signal.throwIfAborted()
    submission = session.beginSubmission({ text, mode: 'queue', attachments: [] })
    const result = await session.prompt([{ type: 'text', text }], 'queue', signal, submission.requestId)
    if (!result?.ok || result.value?.accepted !== true) {
      throw new Error(result?.error?.message || 'DSH 未确认接收；请先查看会话，避免重复提交')
    }
    return text
  } catch (error) {
    submission?.abandon()
    throw error
  } finally {
    reference.release()
  }
}
