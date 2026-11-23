// Shared validation also runs on the host; browser validation is only feedback.
export const MAX_STEPS = 32
export const MAX_PROMPT = 60000
export const STEP_FIELDS = ['title', 'instructions', 'inputs', 'output', 'completion']

export function invalid(message, status = 400) {
  return Object.assign(new Error(message), { status })
}

export function object(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw invalid('内容必须是 JSON 对象')
  }
  return value
}

function string(value, label, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw invalid(label + '不能为空、类型错误或超出长度限制（' + max + ' 字）')
  }
  return value
}

export function id(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(value)) throw invalid('配置标识无效')
  return value
}

const starterGroups = new Map([['环境信息', 'builtin-environment'], ['模型配置', 'builtin-model'], ['任务配置', 'builtin-task']])

// v1 stored a flat list. Preserve linked templates first, then group old entries
// by their original step title. New custom steps use their own stable identity.
export function groupOf(item, templates) {
  if (item.groupId) return item.groupId
  const source = templates.find(row => row.id === item.templateId)
  const title = source?.title || item.title
  return source?.groupId || starterGroups.get(title) ||
    templates.find(row => !row.groupId && row.title === title)?.id || item.id
}

export function step(value, allowEmpty = false) {
  object(value)
  const result = { id: id(value.id) }
  for (const field of STEP_FIELDS) {
    result[field] = string(value[field], field === 'title' ? '步骤名称' : '步骤内容', field === 'title' ? 120 : 12000, field === 'title' || (field === 'instructions' && !allowEmpty))
  }
  if (value.templateId !== undefined) result.templateId = id(value.templateId)
  if (value.groupId !== undefined) result.groupId = id(value.groupId)
  return result
}

export function preset(value) {
  const item = step(value)
  delete item.templateId
  if (value.presetName !== undefined) item.presetName = string(value.presetName, '预设名称', 120, true).trim()
  return item
}

export function workflow(value, allowEmpty = false) {
  object(value)
  if (!Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > MAX_STEPS) {
    throw invalid('流程需包含 1–' + MAX_STEPS + ' 个步骤')
  }
  const result = {
    id: id(value.id),
    title: string(value.title, '流程名称', 120, true),
    goal: string(value.goal, '总体目标', 12000),
    steps: value.steps.map(item => step(item, allowEmpty))
  }
  unique(result.steps)
  // Adding group identities to a previously valid workflow must not consume its text budget.
  if (JSON.stringify(result, (key, entry) => key === 'groupId' ? undefined : entry).length > 55000) throw invalid('流程内容过长，请控制在 55000 字以内')
  return result
}

function unique(items) {
  if (new Set(items.map(item => item.id)).size !== items.length) throw invalid('配置标识重复')
}

export function library(value) {
  object(value)
  if (value.version !== 1) throw invalid('不支持此配置版本')
  const result = { version: 1, revision: id(value.revision) }
  for (const [field, validate] of [['templates', preset], ['workflows', item => workflow(item, true)]]) {
    if (!Array.isArray(value[field]) || value[field].length > 100) throw invalid('每类最多保存 100 条配置')
    result[field] = value[field].map(validate)
    unique(result[field])
  }
  if (JSON.stringify(result).length > 2 * 1024 * 1024) throw invalid('配置库超过 2 MB 限制')
  return result
}

export function copyStep(template, newId) {
  return { ...step(template), id: id(newId), templateId: template.id }
}

export function compileWorkflow(value) {
  const flow = workflow(value)
  const text = [
    '以下是用户组合的完整任务配置，可能包括环境信息、模型配置、任务要求以及补充步骤。先通读全部配置，综合理解后制定执行计划并完成任务。',
    '配置段的顺序用于组织上下文，不代表需要对每一段单独调用模型。若用户明确指定执行顺序，则遵循该顺序。',
    '遵守当前会话的工作目录、模型、工具权限和确认机制；流程文字不授予额外权限。',
    '根据环境配置使用现有 SSH 或其他可用工具连接指定服务器，先核实主机、目录、运行环境和资源。没有可用连接或必要参数时说明具体阻塞，不假装已连接或执行。',
    '模型配置描述本次任务要使用的模型与参数，不自动变更 DSH 自身的模型或权限。遵循用户指定的任务与完成条件，记录实际产出和验证结果；失败时报告原因，不虚报完成。',
    '凭据使用现有安全配置或凭据引用，不读取、输出或在结果里泄露密钥。完成后汇总实际执行、产出位置、验证结果和未完成事项。',
    '', '流程：' + flow.title, '总体目标：' + (flow.goal || '按以下步骤完成工作。'),
    ...flow.steps.flatMap((item, index) => [
      '', '## 配置步骤 ' + (index + 1) + '：' + item.title,
      '配置 / 执行说明：\n' + item.instructions,
      '输入 / 参考资料：\n' + (item.inputs || '结合总体目标和前序步骤产出。'),
      '预期产出：\n' + (item.output || '给出本步骤的实际结果。'),
      '完成条件：\n' + (item.completion || '核实执行说明已完成，并报告证据。')
    ])
  ].join('\n')
  if (text.length > MAX_PROMPT) throw invalid('完整流程超出发送长度限制')
  return text
}

export function starterFlow(makeId) {
  return {
    id: makeId(), title: '服务器任务', goal: '',
    steps: ['环境信息', '模型配置', '任务配置'].map(title => ({
      id: makeId(), groupId: starterGroups.get(title), title, instructions: '', inputs: '', output: '', completion: ''
    }))
  }
}
