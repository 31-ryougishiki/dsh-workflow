import { createElement as h, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { compileWorkflow, copyStep, starterFlow, step, workflow, MAX_STEPS } from '../lib/model.js'
import { submitWorkflow } from '../lib/submit.js'
import { css } from './style.js'

export const inject = ['slots', 'sessions']
const uid = () => crypto.randomUUID()
const blankStep = () => ({ id: uid(), title: '', instructions: '', inputs: '', output: '', completion: '' })
const clone = value => JSON.parse(JSON.stringify(value))
const hints = {
  环境信息: '填写 SSH 主机别名、工作目录、环境激活命令、GPU / CUDA、数据路径等。凭据写引用，不填明文密码。',
  模型配置: '填写模型名称或路径、版本、推理 / 训练框架、精度、并行方式、关键参数等。',
  任务配置: '填写具体目标、数据集、执行要求、输出目录、验收指标和限制条件。'
}

async function api(action, signal) {
  const response = await fetch('/api/workflow-builder/library', {
    method: action ? 'POST' : 'GET', credentials: 'same-origin', signal,
    ...(action ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) } : {})
  })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error || '配置库访问失败')
  return value
}

function button(label, onClick, props = {}) {
  return h('button', { type: 'button', onClick, ...props }, label)
}

function field(label, value, onChange, options = {}) {
  return h('label', null, label, h(options.single ? 'input' : 'textarea', {
    value, onChange: event => onChange(event.target.value), maxLength: options.single ? 120 : 12000,
    placeholder: options.placeholder || '', rows: options.rows || 3, 'aria-label': label
  }))
}

export function WorkflowBuilder({ sessionId, sessions, lifetime }) {
  const [opened, setOpened] = useState(false)
  const [flow, setFlow] = useState(() => starterFlow(uid))
  const [saved, setSaved] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('先填写环境、模型和任务，也可以从左侧配置库复用。')
  const [failed, setFailed] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [preview, setPreview] = useState('')
  const dialog = useRef(null)
  const operation = useRef(null)
  const mounted = useRef(true)
  const activeSession = useRef(sessionId)
  activeSession.current = sessionId

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; operation.current?.abort() }
  }, [])
  useEffect(() => {
    if (opened) dialog.current?.showModal()
    else dialog.current?.close()
  }, [opened])
  useEffect(() => {
    // A session switch must not send a pending old-context handoff.
    operation.current?.abort()
  }, [sessionId])

  async function run(work) {
    if (operation.current) return
    const controller = new AbortController()
    operation.current = controller
    const signal = AbortSignal.any([controller.signal, lifetime])
    setBusy(true)
    setFailed(false)
    try {
      await work(signal)
    } catch (error) {
      if (mounted.current && !lifetime.aborted) {
        setFailed(true)
        setNotice(signal.aborted ? '已停止本机等待。若已经提交，请到 DSH 会话查看接收情况或停止任务；这不会撤销服务器操作。' : error.message)
      }
    } finally {
      operation.current = null
      if (mounted.current && !lifetime.aborted) setBusy(false)
    }
  }

  async function refresh(signal) {
    const value = await api(null, signal)
    signal.throwIfAborted()
    setSaved(value)
    setNotice(value.recovered ? '主文件不可读，已从上一份备份恢复。当前草稿保留。' : '配置库已载入；编辑步骤不会更改原模板。')
  }

  function edit(next) {
    setFlow(next)
    setDirty(true)
    setPreview('')
  }

  function replaceDraft(next) {
    if (dirty && !window.confirm('当前流程有未保存修改，确定替换草稿？')) return
    setFlow(clone(next))
    setDirty(false)
    setPreview('')
  }

  function updateStep(index, patch) {
    edit({ ...flow, steps: flow.steps.map((item, i) => i === index ? { ...item, ...patch } : item) })
  }

  function append(item) {
    if (flow.steps.length >= MAX_STEPS) { setFailed(true); setNotice('最多添加 ' + MAX_STEPS + ' 个步骤'); return }
    edit({ ...flow, steps: [...flow.steps, item] })
  }

  async function change(action, signal) {
    if (!saved) throw new Error('请先刷新配置库')
    const value = await api({ revision: saved.revision, ...action }, signal)
    signal.throwIfAborted()
    setSaved(value)
  }

  function saveFlow(asCopy) {
    run(async signal => {
      const next = workflow({ ...flow, id: asCopy ? uid() : flow.id })
      await change({ action: 'save-workflow', item: next }, signal)
      setFlow(next)
      setDirty(false)
      setNotice(asCopy ? '已另存为新流程。' : '流程已保存。')
    })
  }

  function saveTemplate(index, overwrite) {
    run(async signal => {
      const source = flow.steps[index]
      if (overwrite && !window.confirm('确认用当前内容更新已保存模板？已有流程中的副本不会改变。')) return
      const template = step({ ...source, id: overwrite ? source.templateId : uid() })
      delete template.templateId
      await change({ action: 'save-template', item: template }, signal)
      updateStep(index, { templateId: template.id })
      setNotice(overwrite ? '模板已更新，其他流程中的副本保持原内容。' : '步骤已保存为可复用配置。')
    })
  }

  function deleteSaved(kind, item) {
    if (!window.confirm('确认删除“' + item.title + '”？当前流程草稿和其他流程中的副本会保留。')) return
    run(async signal => {
      await change({ action: 'delete-' + kind, id: item.id }, signal)
      setNotice('已删除保存的配置。')
    })
  }

  function move(index, offset) {
    const steps = [...flow.steps]
    ;[steps[index], steps[index + offset]] = [steps[index + offset], steps[index]]
    edit({ ...flow, steps })
  }

  function showPreview() {
    try { setPreview(compileWorkflow(flow)); setFailed(false); setNotice('这是即将交给 DSH 的完整内容。') }
    catch (error) { setFailed(true); setNotice(error.message) }
  }

  const libraryPane = h('aside', { className: 'dwf-library' },
    h('h3', null, '流程库'),
    button('＋ 环境 → 模型 → 任务', () => { replaceDraft(starterFlow(uid)) }, { disabled: busy }),
    ...(saved?.workflows || []).map(item => h('div', { key: item.id, className: 'dwf-item' },
      button(item.title, () => replaceDraft(item), { disabled: busy }),
      button('×', () => deleteSaved('workflow', item), { disabled: busy, title: '删除流程 ' + item.title, 'aria-label': '删除流程 ' + item.title })
    )),
    !saved?.workflows.length && h('p', { className: 'dwf-empty' }, '保存整套流程后，下次可以直接打开、调整、执行。'),
    h('h3', null, '步骤配置库'),
    ...(saved?.templates || []).map(item => h('div', { key: item.id, className: 'dwf-item' },
      button('＋ ' + item.title, () => append(copyStep(item, uid())), { disabled: busy, title: '复制到流程末尾，可继续修改' }),
      button('×', () => deleteSaved('template', item), { disabled: busy, title: '删除模板 ' + item.title, 'aria-label': '删除模板 ' + item.title })
    )),
    !saved?.templates.length && h('p', { className: 'dwf-empty' }, '将常用服务器、模型参数、任务说明分别保存，再按需组合。'),
    button('刷新配置库', () => run(refresh), { disabled: busy })
  )

  const editor = h('main', { className: 'dwf-editor' },
    field('流程名称', flow.title, title => edit({ ...flow, title }), { single: true }),
    field('总体目标（可选）', flow.goal, goal => edit({ ...flow, goal }), { rows: 2, placeholder: '本次在服务器上要完成什么？' }),
    h('div', { className: 'dwf-row dwf-toolbar' },
      h('select', { 'aria-label': '已保存步骤配置', value: selectedTemplate, onChange: event => setSelectedTemplate(event.target.value) },
        h('option', { value: '' }, '选择已保存配置…'),
        ...(saved?.templates || []).map(item => h('option', { key: item.id, value: item.id }, item.title))),
      button('添加配置副本', () => {
        const template = saved?.templates.find(item => item.id === selectedTemplate)
        if (template) append(copyStep(template, uid()))
      }, { disabled: busy || !saved?.templates.some(item => item.id === selectedTemplate) }),
      button('＋ 空白步骤', () => append(blankStep()), { disabled: busy })
    ),
    ...flow.steps.map((item, index) => h('section', { className: 'dwf-step', key: item.id },
      h('div', { className: 'dwf-stephead' },
        h('strong', null, String(index + 1).padStart(2, '0')),
        h('input', { 'aria-label': '步骤 ' + (index + 1) + ' 名称', value: item.title, maxLength: 120, placeholder: '步骤名称', onChange: event => updateStep(index, { title: event.target.value }) }),
        button('↑', () => move(index, -1), { disabled: busy || index === 0, 'aria-label': '上移步骤 ' + (index + 1) }),
        button('↓', () => move(index, 1), { disabled: busy || index === flow.steps.length - 1, 'aria-label': '下移步骤 ' + (index + 1) }),
        button('复制', () => append({ ...item, id: uid() }), { disabled: busy }),
        button('删除', () => edit({ ...flow, steps: flow.steps.filter((_, i) => i !== index) }), { disabled: busy, className: 'danger', 'aria-label': '删除步骤 ' + (index + 1) })),
      item.templateId && h('p', { className: 'dwf-template-note' }, '来自已保存配置的副本 · 可自由修改'),
      h('select', {
        'aria-label': '步骤 ' + (index + 1) + ' 使用已保存配置', value: '', style: { marginBottom: 12 },
        onChange: event => {
          const template = saved?.templates.find(row => row.id === event.target.value)
          if (!template) return
          if (item.instructions && !window.confirm('用已保存配置替换此步骤内容？其他步骤不变。')) return
          updateStep(index, copyStep(template, item.id))
        }
      }, h('option', { value: '' }, '手动填写，或选择已保存配置…'),
      ...(saved?.templates || []).map(template => h('option', { key: template.id, value: template.id }, template.title))),
      field('配置内容 / 执行说明 ' + (index + 1), item.instructions, instructions => updateStep(index, { instructions }), { rows: 4, placeholder: hints[item.title] || '填写此步骤的配置或要求…' }),
      h('details', null, h('summary', null, '补充输入、产出和完成条件（可选）'),
        field('输入 / 参考资料 ' + (index + 1), item.inputs, inputs => updateStep(index, { inputs })),
        h('div', { className: 'dwf-grid' },
          field('预期产出 ' + (index + 1), item.output, output => updateStep(index, { output })),
          field('完成条件 ' + (index + 1), item.completion, completion => updateStep(index, { completion })))),
      h('div', { className: 'dwf-row' },
        button('存为新配置', () => saveTemplate(index, false), { disabled: busy || !saved }),
        item.templateId && saved?.templates.some(template => template.id === item.templateId) && button('更新原配置', () => saveTemplate(index, true), { disabled: busy }))
    )),
    !flow.steps.length && h('p', { className: 'dwf-empty' }, '添加一个步骤，或从配置库选择。'),
    preview && h('section', null, h('h3', null, '完整 Prompt 预览'), h('pre', { className: 'dwf-preview' }, preview))
  )

  return h('div', null,
    button('流程编排', () => { setOpened(true); run(refresh) }, { className: 'dwf-launch' }),
    createPortal(h('dialog', {
      className: 'dwf', ref: dialog, 'aria-label': '流程编排',
      onCancel: event => { event.preventDefault(); setOpened(false) }
    },
    h('style', null, css),
    h('header', { className: 'dwf-head' },
      h('div', null, h('p', { className: 'dwf-mark' }, 'DSH / WORKFLOW BUILDER'), h('h2', null, '配置一次，组合执行'), h('p', { className: 'dwf-sub' }, '环境信息 → 模型配置 → 任务配置 · 完整交给当前 DSH 会话')),
      button('收起', () => setOpened(false), { title: '保留当前草稿，收起面板' })),
    h('div', { className: 'dwf-body' }, libraryPane, h('fieldset', { disabled: busy, style: { border: 0, padding: 0, margin: 0, minWidth: 0, overflow: 'auto' } }, editor)),
    h('footer', { className: 'dwf-foot' },
      h('div', { className: 'dwf-status', role: 'status', 'data-error': failed }, dirty ? '● 未保存修改　' : '', notice),
      h('div', { className: 'dwf-row' },
        busy && button('停止等待', () => operation.current?.abort()),
        button('保存流程', () => saveFlow(false), { disabled: busy || !saved }),
        button('另存副本', () => saveFlow(true), { disabled: busy || !saved }),
        button('预览', showPreview, { disabled: busy }),
        button('交给 DSH 执行', () => run(async signal => {
          const target = activeSession.current
          await submitWorkflow(sessions, target, clone(flow), signal)
          signal.throwIfAborted()
          if (mounted.current && !lifetime.aborted && activeSession.current === target) {
            setNotice('完整流程已被 DSH 接收。请在当前会话查看执行进度、授权请求和结果；收起面板不停止任务。')
          }
        }), { className: 'primary', disabled: busy || !sessionId })
      ))
    ), document.body)
  )
}

export function apply(ctx) {
  ctx.effect(() => {
    const lifetime = new AbortController()
    const remove = ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
      name: 'conversation.input.dock', id: 'workflow-builder', order: 110,
      inject: () => ({ sessions: ctx.sessions, lifetime: lifetime.signal })
    }, WorkflowBuilder))
    return () => { lifetime.abort(); remove() }
  }, 'workflow-builder: conversation entry')
}
