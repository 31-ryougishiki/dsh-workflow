window.__ModuleLoader__.load({ id: "dsh-workflow-builder", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.js
var client_exports = {};
__export(client_exports, {
  WorkflowBuilder: () => WorkflowBuilder,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
var import_react_dom = require("react-dom");

// lib/model.js
var MAX_STEPS = 32;
var MAX_PROMPT = 6e4;
var STEP_FIELDS = ["title", "instructions", "inputs", "output", "completion"];
function invalid(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
function object(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("\u5185\u5BB9\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
  }
  return value;
}
function string(value, label, max, required = false) {
  if (typeof value !== "string" || value.length > max || required && !value.trim()) {
    throw invalid(label + "\u4E0D\u80FD\u4E3A\u7A7A\u3001\u7C7B\u578B\u9519\u8BEF\u6216\u8D85\u51FA\u957F\u5EA6\u9650\u5236\uFF08" + max + " \u5B57\uFF09");
  }
  return value;
}
function id(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(value)) throw invalid("\u914D\u7F6E\u6807\u8BC6\u65E0\u6548");
  return value;
}
var starterGroups = /* @__PURE__ */ new Map([["\u73AF\u5883\u4FE1\u606F", "builtin-environment"], ["\u6A21\u578B\u914D\u7F6E", "builtin-model"], ["\u4EFB\u52A1\u914D\u7F6E", "builtin-task"]]);
function groupOf(item, templates) {
  if (item.groupId) return item.groupId;
  const source = templates.find((row) => row.id === item.templateId);
  const title = source?.title || item.title;
  return source?.groupId || starterGroups.get(title) || templates.find((row) => !row.groupId && row.title === title)?.id || item.id;
}
function step(value, allowEmpty = false) {
  object(value);
  const result = { id: id(value.id) };
  for (const field2 of STEP_FIELDS) {
    result[field2] = string(value[field2], field2 === "title" ? "\u6B65\u9AA4\u540D\u79F0" : "\u6B65\u9AA4\u5185\u5BB9", field2 === "title" ? 120 : 12e3, field2 === "title" || field2 === "instructions" && !allowEmpty);
  }
  if (value.templateId !== void 0) result.templateId = id(value.templateId);
  if (value.groupId !== void 0) result.groupId = id(value.groupId);
  return result;
}
function preset(value) {
  const item = step(value);
  delete item.templateId;
  if (value.presetName !== void 0) item.presetName = string(value.presetName, "\u9884\u8BBE\u540D\u79F0", 120, true).trim();
  return item;
}
function workflow(value, allowEmpty = false) {
  object(value);
  if (!Array.isArray(value.steps) || !allowEmpty && value.steps.length < 1 || value.steps.length > MAX_STEPS) {
    throw invalid("\u6D41\u7A0B\u9700\u5305\u542B 1\u2013" + MAX_STEPS + " \u4E2A\u6B65\u9AA4");
  }
  const result = {
    id: id(value.id),
    title: string(value.title, "\u6D41\u7A0B\u540D\u79F0", 120, true),
    goal: string(value.goal, "\u603B\u4F53\u76EE\u6807", 12e3),
    steps: value.steps.map((item) => step(item, allowEmpty))
  };
  unique(result.steps);
  if (JSON.stringify(result, (key, entry) => key === "groupId" ? void 0 : entry).length > 55e3) throw invalid("\u6D41\u7A0B\u5185\u5BB9\u8FC7\u957F\uFF0C\u8BF7\u63A7\u5236\u5728 55000 \u5B57\u4EE5\u5185");
  return result;
}
function unique(items) {
  if (new Set(items.map((item) => item.id)).size !== items.length) throw invalid("\u914D\u7F6E\u6807\u8BC6\u91CD\u590D");
}
function compileWorkflow(value) {
  const flow = workflow(value);
  const text = [
    "\u4EE5\u4E0B\u662F\u7528\u6237\u7EC4\u5408\u7684\u5B8C\u6574\u4EFB\u52A1\u914D\u7F6E\uFF0C\u53EF\u80FD\u5305\u62EC\u73AF\u5883\u4FE1\u606F\u3001\u6A21\u578B\u914D\u7F6E\u3001\u4EFB\u52A1\u8981\u6C42\u4EE5\u53CA\u8865\u5145\u6B65\u9AA4\u3002\u5148\u901A\u8BFB\u5168\u90E8\u914D\u7F6E\uFF0C\u7EFC\u5408\u7406\u89E3\u540E\u5236\u5B9A\u6267\u884C\u8BA1\u5212\u5E76\u5B8C\u6210\u4EFB\u52A1\u3002",
    "\u914D\u7F6E\u6BB5\u7684\u987A\u5E8F\u7528\u4E8E\u7EC4\u7EC7\u4E0A\u4E0B\u6587\uFF0C\u4E0D\u4EE3\u8868\u9700\u8981\u5BF9\u6BCF\u4E00\u6BB5\u5355\u72EC\u8C03\u7528\u6A21\u578B\u3002\u82E5\u7528\u6237\u660E\u786E\u6307\u5B9A\u6267\u884C\u987A\u5E8F\uFF0C\u5219\u9075\u5FAA\u8BE5\u987A\u5E8F\u3002",
    "\u9075\u5B88\u5F53\u524D\u4F1A\u8BDD\u7684\u5DE5\u4F5C\u76EE\u5F55\u3001\u6A21\u578B\u3001\u5DE5\u5177\u6743\u9650\u548C\u786E\u8BA4\u673A\u5236\uFF1B\u6D41\u7A0B\u6587\u5B57\u4E0D\u6388\u4E88\u989D\u5916\u6743\u9650\u3002",
    "\u6839\u636E\u73AF\u5883\u914D\u7F6E\u4F7F\u7528\u73B0\u6709 SSH \u6216\u5176\u4ED6\u53EF\u7528\u5DE5\u5177\u8FDE\u63A5\u6307\u5B9A\u670D\u52A1\u5668\uFF0C\u5148\u6838\u5B9E\u4E3B\u673A\u3001\u76EE\u5F55\u3001\u8FD0\u884C\u73AF\u5883\u548C\u8D44\u6E90\u3002\u6CA1\u6709\u53EF\u7528\u8FDE\u63A5\u6216\u5FC5\u8981\u53C2\u6570\u65F6\u8BF4\u660E\u5177\u4F53\u963B\u585E\uFF0C\u4E0D\u5047\u88C5\u5DF2\u8FDE\u63A5\u6216\u6267\u884C\u3002",
    "\u6A21\u578B\u914D\u7F6E\u63CF\u8FF0\u672C\u6B21\u4EFB\u52A1\u8981\u4F7F\u7528\u7684\u6A21\u578B\u4E0E\u53C2\u6570\uFF0C\u4E0D\u81EA\u52A8\u53D8\u66F4 DSH \u81EA\u8EAB\u7684\u6A21\u578B\u6216\u6743\u9650\u3002\u9075\u5FAA\u7528\u6237\u6307\u5B9A\u7684\u4EFB\u52A1\u4E0E\u5B8C\u6210\u6761\u4EF6\uFF0C\u8BB0\u5F55\u5B9E\u9645\u4EA7\u51FA\u548C\u9A8C\u8BC1\u7ED3\u679C\uFF1B\u5931\u8D25\u65F6\u62A5\u544A\u539F\u56E0\uFF0C\u4E0D\u865A\u62A5\u5B8C\u6210\u3002",
    "\u51ED\u636E\u4F7F\u7528\u73B0\u6709\u5B89\u5168\u914D\u7F6E\u6216\u51ED\u636E\u5F15\u7528\uFF0C\u4E0D\u8BFB\u53D6\u3001\u8F93\u51FA\u6216\u5728\u7ED3\u679C\u91CC\u6CC4\u9732\u5BC6\u94A5\u3002\u5B8C\u6210\u540E\u6C47\u603B\u5B9E\u9645\u6267\u884C\u3001\u4EA7\u51FA\u4F4D\u7F6E\u3001\u9A8C\u8BC1\u7ED3\u679C\u548C\u672A\u5B8C\u6210\u4E8B\u9879\u3002",
    "",
    "\u6D41\u7A0B\uFF1A" + flow.title,
    "\u603B\u4F53\u76EE\u6807\uFF1A" + (flow.goal || "\u6309\u4EE5\u4E0B\u6B65\u9AA4\u5B8C\u6210\u5DE5\u4F5C\u3002"),
    ...flow.steps.flatMap((item, index) => [
      "",
      "## \u914D\u7F6E\u6B65\u9AA4 " + (index + 1) + "\uFF1A" + item.title,
      item.instructions
    ])
  ].join("\n");
  if (text.length > MAX_PROMPT) throw invalid("\u5B8C\u6574\u6D41\u7A0B\u8D85\u51FA\u53D1\u9001\u957F\u5EA6\u9650\u5236");
  return text;
}
function starterFlow(makeId) {
  return {
    id: makeId(),
    title: "\u670D\u52A1\u5668\u4EFB\u52A1",
    goal: "",
    steps: ["\u73AF\u5883\u4FE1\u606F", "\u6A21\u578B\u914D\u7F6E", "\u4EFB\u52A1\u914D\u7F6E"].map((title) => ({
      id: makeId(),
      groupId: starterGroups.get(title),
      title,
      instructions: "",
      inputs: "",
      output: "",
      completion: ""
    }))
  };
}

// lib/submit.js
async function submitWorkflow(sessions, sessionId, flow, signal) {
  const text = compileWorkflow(flow);
  signal.throwIfAborted();
  if (!sessionId) throw new Error("\u8BF7\u5148\u9009\u62E9\u6216\u65B0\u5EFA\u4E00\u4E2A DSH \u4F1A\u8BDD");
  const reference = sessions.retain(sessionId, { source: "workflowBuilder", signal });
  let submission;
  try {
    const { session } = await reference.ready;
    signal.throwIfAborted();
    submission = session.beginSubmission({ text, mode: "queue", attachments: [] });
    const result = await session.prompt([{ type: "text", text }], "queue", signal, submission.requestId);
    if (!result?.ok || result.value?.accepted !== true) {
      throw new Error(result?.error?.message || "DSH \u672A\u786E\u8BA4\u63A5\u6536\uFF1B\u8BF7\u5148\u67E5\u770B\u4F1A\u8BDD\uFF0C\u907F\u514D\u91CD\u590D\u63D0\u4EA4");
    }
    return text;
  } catch (error) {
    submission?.abandon();
    throw error;
  } finally {
    reference.release();
  }
}

// src/style.js
var css = `
.dwf .dwf-step-summary{display:flex;align-items:center;gap:8px}.dwf-step-summary span{flex:1;min-width:0;overflow-wrap:anywhere}.dwf-step-summary::before{content:'\u25B8'}.dwf-step[open]>.dwf-step-summary::before{content:'\u25BE'}
.dwf-launch {border:1px solid var(--dsw-alias-border-l2,#d5dbd7);border-radius:16px;padding:4px 12px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.dwf {box-sizing:border-box;width:min(1160px,96vw);height:min(850px,92vh);padding:0;border:1px solid #cdd9d3;border-radius:18px;background:#f5f7f5;color:#24372e;box-shadow:0 24px 90px #11251a40;font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif}
.dwf[open]{display:flex;flex-direction:column;overflow:hidden}.dwf::backdrop {background:#0e201b80;backdrop-filter:blur(3px)}
.dwf * {box-sizing:border-box}.dwf button,.dwf input,.dwf textarea,.dwf select{font:inherit}
.dwf button{cursor:pointer;border:1px solid #d2ded6;border-radius:8px;padding:7px 11px;background:#fff;color:#254938;white-space:nowrap}
.dwf button:hover{background:#e9f0eb}.dwf button:disabled{opacity:.45;cursor:not-allowed}.dwf button:focus-visible,.dwf input:focus,.dwf textarea:focus,.dwf select:focus{outline:2px solid #29946a;outline-offset:2px}
.dwf .primary{background:#216a4d;color:#fff;border-color:#216a4d}.dwf .danger{color:#a23838}.dwf h2,.dwf h3,.dwf p{margin:0}.dwf h2{font-size:22px;letter-spacing:-.6px}.dwf h3{font-size:15px}
.dwf-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 26px;border-bottom:1px solid #dae3dc;background:#fff;flex-shrink:0}.dwf-sub{color:#708176;font-size:12px;margin-top:4px!important}
.dwf-body{display:grid;grid-template-columns:235px minmax(0,1fr);flex:1;min-height:0}
.dwf-library{padding:22px 16px;border-right:1px solid #dae3dc;overflow:auto;background:#eff3ef}.dwf-library h3{margin:20px 0 10px}.dwf-library h3:first-child{margin-top:0}
.dwf-library>button{white-space:normal;width:100%}.dwf-item{display:flex;gap:5px;margin:7px 0;align-items:center}.dwf-item>button:first-child{flex:1;min-width:0;text-align:left;white-space:normal;overflow-wrap:anywhere}.dwf-empty{color:#748479;font-size:12px;padding:8px 0}
.dwf-editor{padding:22px 26px;height:100%;overflow:auto}.dwf label{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-size:12px;font-weight:600;color:#52705e}
.dwf input,.dwf textarea,.dwf select{width:100%;border:1px solid #cdd9d1;border-radius:8px;padding:9px 11px;background:#fff;color:#263b2e;font-weight:400}.dwf textarea{resize:vertical;min-height:80px;line-height:1.6}.dwf input{height:38px}
.dwf-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.dwf-row select{flex:1;min-width:150px}.dwf-row>label{flex:1}.dwf-toolbar{margin:16px 0}.dwf-step{background:#fff;border:1px solid #d4dfd7;border-radius:12px;margin:14px 0;padding:16px}.dwf-stephead{display:flex;align-items:center;gap:9px;margin-bottom:12px}.dwf-stephead strong{background:#edf4ef;border-radius:6px;padding:4px 9px;color:#216a4d}.dwf-stephead input{flex:1;min-width:80px;font-weight:600}.dwf-stephead button{padding:5px 8px}
.dwf details{margin-top:10px}.dwf summary{cursor:pointer;color:#66816d;font-size:12px;margin-bottom:12px}.dwf-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.dwf-template-note{font-size:12px;color:#6b8172;margin-bottom:10px}
.dwf-foot{min-height:83px;flex-shrink:0;border-top:1px solid #dae3dc;background:#fff;padding:14px 24px;display:flex;justify-content:space-between;gap:16px;align-items:center}.dwf-status{font-size:12px;color:#426851;max-width:48%;overflow-wrap:anywhere}.dwf-status[data-error=true]{color:#b03838}
.dwf-preview{white-space:pre-wrap;overflow-wrap:anywhere;background:#fff;padding:18px;border:1px solid #d4dfd7;border-radius:10px;font:13px/1.7 system-ui}.dwf-mark{font-size:11px;color:#54806a;letter-spacing:1px;margin-bottom:4px!important}
@media(max-width:750px){.dwf{height:96vh}.dwf-body{grid-template-columns:145px minmax(0,1fr)}.dwf-library{padding:14px 10px}.dwf-editor{padding:14px}.dwf-head{padding:16px}.dwf-stephead{flex-wrap:wrap}.dwf-grid{grid-template-columns:1fr}.dwf-foot{padding:10px 14px;display:block}.dwf-foot .dwf-row{gap:6px;margin-top:8px}.dwf-foot button{padding:6px}.dwf-status{max-width:100%}}
`;

// src/client.js
var inject = ["slots", "sessions"];
var uid = () => crypto.randomUUID();
var blankStep = () => ({ id: uid(), groupId: uid(), title: "", instructions: "", inputs: "", output: "", completion: "" });
var clone = (value) => JSON.parse(JSON.stringify(value));
var hints = {
  \u73AF\u5883\u4FE1\u606F: "\u586B\u5199 SSH \u4E3B\u673A\u522B\u540D\u3001\u5DE5\u4F5C\u76EE\u5F55\u3001\u73AF\u5883\u6FC0\u6D3B\u547D\u4EE4\u3001GPU / CUDA\u3001\u6570\u636E\u8DEF\u5F84\u7B49\u3002\u51ED\u636E\u5199\u5F15\u7528\uFF0C\u4E0D\u586B\u660E\u6587\u5BC6\u7801\u3002",
  \u6A21\u578B\u914D\u7F6E: "\u586B\u5199\u6A21\u578B\u540D\u79F0\u6216\u8DEF\u5F84\u3001\u7248\u672C\u3001\u63A8\u7406 / \u8BAD\u7EC3\u6846\u67B6\u3001\u7CBE\u5EA6\u3001\u5E76\u884C\u65B9\u5F0F\u3001\u5173\u952E\u53C2\u6570\u7B49\u3002",
  \u4EFB\u52A1\u914D\u7F6E: "\u586B\u5199\u5177\u4F53\u76EE\u6807\u3001\u6570\u636E\u96C6\u3001\u6267\u884C\u8981\u6C42\u3001\u8F93\u51FA\u76EE\u5F55\u3001\u9A8C\u6536\u6307\u6807\u548C\u9650\u5236\u6761\u4EF6\u3002"
};
async function api(action, signal) {
  const response = await fetch("/api/workflow-builder/library", {
    method: action ? "POST" : "GET",
    credentials: "same-origin",
    signal,
    ...action ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) } : {}
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "\u914D\u7F6E\u5E93\u8BBF\u95EE\u5931\u8D25");
  return value;
}
function button(label, onClick, props = {}) {
  return (0, import_react.createElement)("button", { type: "button", onClick, ...props }, label);
}
function field(label, value, onChange, options = {}) {
  return (0, import_react.createElement)("label", null, label, (0, import_react.createElement)(options.single ? "input" : "textarea", {
    value,
    onChange: (event) => onChange(event.target.value),
    maxLength: options.single ? 120 : 12e3,
    placeholder: options.placeholder || "",
    rows: options.rows || 3,
    "aria-label": label
  }));
}
function WorkflowBuilder({ sessionId, sessions, lifetime }) {
  const [opened, setOpened] = (0, import_react.useState)(false);
  const [flow, setFlow] = (0, import_react.useState)(() => starterFlow(uid));
  const [saved, setSaved] = (0, import_react.useState)(null);
  const [dirty, setDirty] = (0, import_react.useState)(false);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [notice, setNotice] = (0, import_react.useState)("\u5C55\u5F00\u6B65\u9AA4\uFF0C\u9009\u62E9\u9884\u8BBE\u6216\u624B\u52A8\u586B\u5199\u3002");
  const [failed, setFailed] = (0, import_react.useState)(false);
  const [presetNames, setPresetNames] = (0, import_react.useState)({});
  const [preview, setPreview] = (0, import_react.useState)("");
  const dialog = (0, import_react.useRef)(null);
  const operation = (0, import_react.useRef)(null);
  const mounted = (0, import_react.useRef)(true);
  const activeSession = (0, import_react.useRef)(sessionId);
  activeSession.current = sessionId;
  (0, import_react.useEffect)(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current?.abort();
    };
  }, []);
  (0, import_react.useEffect)(() => {
    if (opened) dialog.current?.showModal();
    else dialog.current?.close();
  }, [opened]);
  (0, import_react.useEffect)(() => {
    operation.current?.abort();
  }, [sessionId]);
  async function run(work) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    const signal = AbortSignal.any([controller.signal, lifetime]);
    setBusy(true);
    setFailed(false);
    try {
      await work(signal);
    } catch (error) {
      if (mounted.current && !lifetime.aborted) {
        setFailed(true);
        setNotice(signal.aborted ? "\u5DF2\u505C\u6B62\u672C\u673A\u7B49\u5F85\u3002\u82E5\u5DF2\u7ECF\u63D0\u4EA4\uFF0C\u8BF7\u5230 DSH \u4F1A\u8BDD\u67E5\u770B\u63A5\u6536\u60C5\u51B5\u6216\u505C\u6B62\u4EFB\u52A1\uFF1B\u8FD9\u4E0D\u4F1A\u64A4\u9500\u670D\u52A1\u5668\u64CD\u4F5C\u3002" : error.message);
      }
    } finally {
      operation.current = null;
      if (mounted.current && !lifetime.aborted) setBusy(false);
    }
  }
  async function refresh(signal) {
    const value = await api(null, signal);
    signal.throwIfAborted();
    if (!value.stepPresets) {
      setSaved(null);
      throw new Error("\u8BF7\u91CD\u542F DSH \u5E76\u5237\u65B0\u9875\u9762\uFF0C\u4EE5\u52A0\u8F7D\u652F\u6301\u6B65\u9AA4\u9884\u8BBE\u7684\u63D2\u4EF6\u7248\u672C\u3002");
    }
    setSaved(value);
    setNotice(value.recovered ? "\u4E3B\u6587\u4EF6\u4E0D\u53EF\u8BFB\uFF0C\u5DF2\u4ECE\u4E0A\u4E00\u4EFD\u5907\u4EFD\u6062\u590D\u3002\u5F53\u524D\u8349\u7A3F\u4FDD\u7559\u3002" : "\u914D\u7F6E\u5E93\u5DF2\u8F7D\u5165\u3002");
  }
  function edit(next) {
    setFlow(next);
    setDirty(true);
    setPreview("");
  }
  function replaceDraft(next) {
    if (dirty && !window.confirm("\u5F53\u524D\u6D41\u7A0B\u6709\u672A\u4FDD\u5B58\u4FEE\u6539\uFF0C\u786E\u5B9A\u66FF\u6362\u8349\u7A3F\uFF1F")) return;
    setPresetNames({});
    setFlow(clone({ ...next, steps: next.steps.map((row) => ({ ...row, groupId: groupOf(row, templates) })) }));
    setDirty(false);
    setPreview("");
  }
  function updateStep(index, patch) {
    edit({ ...flow, steps: flow.steps.map((item, i) => i === index ? { ...item, ...patch } : item) });
  }
  function append(item) {
    if (flow.steps.length >= MAX_STEPS) {
      setFailed(true);
      setNotice("\u6700\u591A\u6DFB\u52A0 " + MAX_STEPS + " \u4E2A\u6B65\u9AA4");
      return;
    }
    edit({ ...flow, steps: [...flow.steps, item] });
  }
  async function change(action, signal) {
    if (!saved) throw new Error("\u8BF7\u5148\u5237\u65B0\u914D\u7F6E\u5E93");
    const value = await api({ revision: saved.revision, ...action }, signal);
    signal.throwIfAborted();
    setSaved(value);
  }
  function saveFlow(asCopy) {
    run(async (signal) => {
      const next = workflow({ ...flow, id: asCopy ? uid() : flow.id }, true);
      await change({ action: "save-workflow", item: next }, signal);
      setFlow(next);
      setDirty(false);
      setNotice(asCopy ? "\u5DF2\u53E6\u5B58\u4E3A\u65B0\u6D41\u7A0B\u3002" : "\u6D41\u7A0B\u5DF2\u4FDD\u5B58\u3002");
    });
  }
  const templates = saved?.templates || [];
  const groups = new Map(templates.map((row) => [groupOf(row, templates), row.title]));
  function savePreset(index, overwrite) {
    run(async (signal) => {
      const source = flow.steps[index];
      const selected = templates.find((row) => row.id === source.templateId);
      const name = presetNames[source.id] ?? (selected?.presetName || selected?.title || "");
      if (!name.trim()) throw new Error("\u8BF7\u5148\u586B\u5199\u9884\u8BBE\u540D\u79F0\uFF0C\u4F8B\u5982\u201C\u670D\u52A1\u5668 A\u201D");
      if (overwrite && !window.confirm("\u66F4\u65B0\u6240\u9009\u9884\u8BBE\u201C" + (selected.presetName || selected.title) + "\u201D\uFF1F")) return;
      const item = preset({ ...source, groupId: groupOf(source, templates), id: overwrite ? selected.id : uid(), presetName: name });
      await change({ action: "save-preset", item }, signal);
      updateStep(index, { groupId: item.groupId, templateId: item.id });
      setPresetNames((names) => ({ ...names, [source.id]: void 0 }));
      setNotice("\u5DF2\u4FDD\u5B58\u300C" + source.title + "\u300D\u7684\u9884\u8BBE\u300C" + item.presetName + "\u300D\u3002");
    });
  }
  function deleteSaved(kind, item) {
    if (!window.confirm("\u786E\u8BA4\u5220\u9664\u201C" + item.title + "\u201D\uFF1F\u5F53\u524D\u6D41\u7A0B\u8349\u7A3F\u548C\u5176\u4ED6\u6D41\u7A0B\u4E2D\u7684\u526F\u672C\u4F1A\u4FDD\u7559\u3002")) return;
    run(async (signal) => {
      await change({ action: "delete-" + kind, id: item.id }, signal);
      setNotice("\u5DF2\u5220\u9664\u4FDD\u5B58\u7684\u914D\u7F6E\u3002");
    });
  }
  function move(index, offset) {
    const steps = [...flow.steps];
    [steps[index], steps[index + offset]] = [steps[index + offset], steps[index]];
    edit({ ...flow, steps });
  }
  function deleteGroup(groupId, title) {
    const count = templates.filter((row) => groupOf(row, templates) === groupId).length;
    if (!window.confirm("\u5220\u9664\u53EF\u590D\u7528\u6B65\u9AA4\u300C" + title + "\u300D\u53CA\u5176 " + count + " \u4E2A\u9884\u8BBE\uFF1F\u5DF2\u52A0\u5165\u6D41\u7A0B\u7684\u6B65\u9AA4\u5185\u5BB9\u4F1A\u4FDD\u7559\u3002")) return;
    run(async (signal) => {
      await change({ action: "delete-group", id: groupId }, signal);
      setNotice("\u5DF2\u4ECE\u53EF\u590D\u7528\u6B65\u9AA4\u4E2D\u5220\u9664\u300C" + title + "\u300D\u3002");
    });
  }
  function showPreview() {
    try {
      setPreview(compileWorkflow(flow));
      setFailed(false);
      setNotice("\u8FD9\u662F\u5373\u5C06\u4EA4\u7ED9 DSH \u7684\u5B8C\u6574\u5185\u5BB9\u3002");
    } catch (error) {
      setFailed(true);
      setNotice(error.message);
    }
  }
  const libraryPane = (0, import_react.createElement)(
    "aside",
    { className: "dwf-library" },
    (0, import_react.createElement)("h3", null, "\u6D41\u7A0B\u5E93"),
    button("\uFF0B \u73AF\u5883 \u2192 \u6A21\u578B \u2192 \u4EFB\u52A1", () => {
      replaceDraft(starterFlow(uid));
    }, { disabled: busy }),
    ...(saved?.workflows || []).map((item) => (0, import_react.createElement)(
      "div",
      { key: item.id, className: "dwf-item" },
      button(item.title, () => replaceDraft(item), { disabled: busy }),
      button("\xD7", () => deleteSaved("workflow", item), { disabled: busy, title: "\u5220\u9664\u6D41\u7A0B " + item.title, "aria-label": "\u5220\u9664\u6D41\u7A0B " + item.title })
    )),
    !saved?.workflows.length && (0, import_react.createElement)("p", { className: "dwf-empty" }, "\u4FDD\u5B58\u6574\u5957\u6D41\u7A0B\u540E\uFF0C\u4E0B\u6B21\u53EF\u4EE5\u76F4\u63A5\u6253\u5F00\u3001\u8C03\u6574\u3001\u6267\u884C\u3002"),
    (0, import_react.createElement)("h3", null, "\u53EF\u590D\u7528\u6B65\u9AA4"),
    ...Array.from(groups, ([groupId, title]) => (0, import_react.createElement)(
      "div",
      { key: groupId, className: "dwf-item" },
      button("\uFF0B " + title, () => append({ ...blankStep(), groupId, title }), { disabled: busy, title: "\u6DFB\u52A0\u6B65\u9AA4\uFF0C\u518D\u9009\u62E9\u5176\u4E2D\u7684\u9884\u8BBE" }),
      button("\u5220\u9664", () => deleteGroup(groupId, title), { disabled: busy, className: "danger", "aria-label": "\u5220\u9664\u53EF\u590D\u7528\u6B65\u9AA4 " + title })
    )),
    !groups.size && (0, import_react.createElement)("p", { className: "dwf-empty" }, "\u4FDD\u5B58\u9884\u8BBE\u540E\uFF0C\u53EF\u5728\u8FD9\u91CC\u590D\u7528\u5B83\u6240\u5C5E\u7684\u6B65\u9AA4\u3002"),
    button("\u5237\u65B0\u914D\u7F6E\u5E93", () => run(refresh), { disabled: busy })
  );
  const editor = (0, import_react.createElement)(
    "main",
    { className: "dwf-editor" },
    field("\u6D41\u7A0B\u540D\u79F0", flow.title, (title) => edit({ ...flow, title }), { single: true }),
    field("\u603B\u4F53\u76EE\u6807\uFF08\u53EF\u9009\uFF09", flow.goal, (goal) => edit({ ...flow, goal }), { rows: 2, placeholder: "\u672C\u6B21\u5728\u670D\u52A1\u5668\u4E0A\u8981\u5B8C\u6210\u4EC0\u4E48\uFF1F" }),
    (0, import_react.createElement)(
      "div",
      { className: "dwf-row dwf-toolbar" },
      button("\uFF0B \u7A7A\u767D\u6B65\u9AA4", () => append(blankStep()), { disabled: busy })
    ),
    ...flow.steps.map((item, index) => {
      const groupId = groupOf(item, templates);
      const choices = templates.filter((row) => groupOf(row, templates) === groupId);
      const selected = choices.find((row) => row.id === item.templateId);
      const label = (row) => row.presetName || row.title;
      return (0, import_react.createElement)(
        "details",
        { className: "dwf-step", key: item.id, open: true },
        (0, import_react.createElement)(
          "summary",
          { className: "dwf-step-summary" },
          (0, import_react.createElement)("span", null, (item.title || "\u65B0\u6B65\u9AA4") + " \xB7 " + (selected ? label(selected) : "\u624B\u52A8\u586B\u5199") + "\uFF08" + choices.length + " \u4E2A\u9884\u8BBE\uFF09"),
          button("\u5220\u9664\u6B65\u9AA4", (event) => {
            event.preventDefault();
            event.stopPropagation();
            edit({ ...flow, steps: flow.steps.filter((row) => row.id !== item.id) });
          }, { disabled: busy, className: "danger", "aria-label": "\u5220\u9664\u6B65\u9AA4 " + (index + 1) })
        ),
        (0, import_react.createElement)(
          "div",
          { className: "dwf-stephead" },
          (0, import_react.createElement)("strong", null, String(index + 1).padStart(2, "0")),
          (0, import_react.createElement)("input", { "aria-label": "\u6B65\u9AA4 " + (index + 1) + " \u540D\u79F0", value: item.title, maxLength: 120, placeholder: "\u6B65\u9AA4\u540D\u79F0", onChange: (event) => updateStep(index, { title: event.target.value }) }),
          button("\u2191", () => move(index, -1), { disabled: busy || index === 0, "aria-label": "\u4E0A\u79FB\u6B65\u9AA4 " + (index + 1) }),
          button("\u2193", () => move(index, 1), { disabled: busy || index === flow.steps.length - 1, "aria-label": "\u4E0B\u79FB\u6B65\u9AA4 " + (index + 1) }),
          button("\u590D\u5236", () => append({ ...item, id: uid() }), { disabled: busy })
        ),
        (0, import_react.createElement)("label", null, "\u6B64\u6B65\u9AA4\u7684\u9884\u8BBE", (0, import_react.createElement)("select", {
          "aria-label": "\u6B65\u9AA4 " + (index + 1) + " \u7684\u9884\u8BBE",
          value: selected?.id || "",
          onChange: (event) => {
            const choice = choices.find((row) => row.id === event.target.value);
            const fields = ["instructions", "inputs", "output", "completion"];
            const modified = fields.some((key) => item[key] !== (selected?.[key] || ""));
            if (choice && modified && !window.confirm("\u5207\u6362\u9884\u8BBE\u4F1A\u66FF\u6362\u5F53\u524D\u6B65\u9AA4\u586B\u5199\u7684\u5185\u5BB9\uFF0C\u7EE7\u7EED\u5417\uFF1F")) return;
            const patch = { groupId, templateId: choice?.id };
            if (choice) {
              for (const key of fields) patch[key] = choice[key];
            }
            updateStep(index, patch);
            setPresetNames((names) => ({ ...names, [item.id]: void 0 }));
          }
        }, (0, import_react.createElement)("option", { value: "" }, "\u624B\u52A8\u586B\u5199"), ...choices.map((row) => (0, import_react.createElement)("option", { key: row.id, value: row.id }, label(row))))),
        field("\u914D\u7F6E\u5185\u5BB9 / \u6267\u884C\u8BF4\u660E " + (index + 1), item.instructions, (instructions) => updateStep(index, { instructions }), { rows: 4, placeholder: hints[item.title] || "\u586B\u5199\u6B64\u6B65\u9AA4\u7684\u914D\u7F6E\u6216\u8981\u6C42\u2026" }),
        (item.inputs || item.output || item.completion) && (0, import_react.createElement)(
          "details",
          null,
          (0, import_react.createElement)("summary", null, "\u67E5\u770B\u65E7\u7248\u8865\u5145\u5185\u5BB9\uFF08\u4EC5\u4F9B\u67E5\u9605\uFF09"),
          (0, import_react.createElement)("p", { style: { whiteSpace: "pre-wrap" } }, [item.inputs, item.output, item.completion].filter(Boolean).join("\n\n"))
        ),
        field(
          "\u9884\u8BBE\u540D\u79F0 " + (index + 1),
          presetNames[item.id] ?? (selected ? label(selected) : ""),
          (name) => setPresetNames((names) => ({ ...names, [item.id]: name })),
          { single: true, placeholder: "\u4F8B\u5982\uFF1A\u670D\u52A1\u5668 A" }
        ),
        (0, import_react.createElement)(
          "div",
          { className: "dwf-row" },
          button("\u53E6\u5B58\u4E3A\u65B0\u9884\u8BBE", () => savePreset(index, false), { disabled: busy || !saved }),
          selected && button("\u66F4\u65B0\u6240\u9009\u9884\u8BBE", () => savePreset(index, true), { disabled: busy }),
          selected && button("\u5220\u9664\u6240\u9009\u9884\u8BBE", () => deleteSaved("template", { ...selected, title: label(selected) }), { disabled: busy })
        )
      );
    }),
    !flow.steps.length && (0, import_react.createElement)("p", { className: "dwf-empty" }, "\u6DFB\u52A0\u4E00\u4E2A\u6B65\u9AA4\uFF0C\u6216\u4ECE\u914D\u7F6E\u5E93\u9009\u62E9\u3002"),
    preview && (0, import_react.createElement)("section", null, (0, import_react.createElement)("h3", null, "\u5B8C\u6574 Prompt \u9884\u89C8"), (0, import_react.createElement)("pre", { className: "dwf-preview" }, preview))
  );
  return (0, import_react.createElement)(
    "div",
    null,
    button("\u6D41\u7A0B\u7F16\u6392", () => {
      setOpened(true);
      run(refresh);
    }, { className: "dwf-launch" }),
    (0, import_react_dom.createPortal)((0, import_react.createElement)(
      "dialog",
      {
        className: "dwf",
        ref: dialog,
        "aria-label": "\u6D41\u7A0B\u7F16\u6392",
        onCancel: (event) => {
          event.preventDefault();
          setOpened(false);
        }
      },
      (0, import_react.createElement)("style", null, css),
      (0, import_react.createElement)(
        "header",
        { className: "dwf-head" },
        (0, import_react.createElement)("div", null, (0, import_react.createElement)("p", { className: "dwf-mark" }, "DSH / WORKFLOW BUILDER"), (0, import_react.createElement)("h2", null, "\u914D\u7F6E\u4E00\u6B21\uFF0C\u7EC4\u5408\u6267\u884C"), (0, import_react.createElement)("p", { className: "dwf-sub" }, "\u73AF\u5883\u4FE1\u606F \u2192 \u6A21\u578B\u914D\u7F6E \u2192 \u4EFB\u52A1\u914D\u7F6E \xB7 \u5B8C\u6574\u4EA4\u7ED9\u5F53\u524D DSH \u4F1A\u8BDD")),
        button("\u6536\u8D77", () => setOpened(false), { title: "\u4FDD\u7559\u5F53\u524D\u8349\u7A3F\uFF0C\u6536\u8D77\u9762\u677F" })
      ),
      (0, import_react.createElement)("div", { className: "dwf-body" }, libraryPane, (0, import_react.createElement)("fieldset", { disabled: busy, style: { border: 0, padding: 0, margin: 0, minWidth: 0, overflow: "auto" } }, editor)),
      (0, import_react.createElement)(
        "footer",
        { className: "dwf-foot" },
        (0, import_react.createElement)("div", { className: "dwf-status", role: "status", "data-error": failed }, dirty ? "\u25CF \u672A\u4FDD\u5B58\u4FEE\u6539\u3000" : "", notice),
        (0, import_react.createElement)(
          "div",
          { className: "dwf-row" },
          busy && button("\u505C\u6B62\u7B49\u5F85", () => operation.current?.abort()),
          button("\u4FDD\u5B58\u6D41\u7A0B", () => saveFlow(false), { disabled: busy || !saved }),
          button("\u53E6\u5B58\u526F\u672C", () => saveFlow(true), { disabled: busy || !saved }),
          button("\u9884\u89C8", showPreview, { disabled: busy }),
          button("\u4EA4\u7ED9 DSH \u6267\u884C", () => run(async (signal) => {
            const target = activeSession.current;
            await submitWorkflow(sessions, target, clone(flow), signal);
            signal.throwIfAborted();
            if (mounted.current && !lifetime.aborted && activeSession.current === target) {
              setNotice("\u5B8C\u6574\u6D41\u7A0B\u5DF2\u88AB DSH \u63A5\u6536\u3002\u8BF7\u5728\u5F53\u524D\u4F1A\u8BDD\u67E5\u770B\u6267\u884C\u8FDB\u5EA6\u3001\u6388\u6743\u8BF7\u6C42\u548C\u7ED3\u679C\uFF1B\u6536\u8D77\u9762\u677F\u4E0D\u505C\u6B62\u4EFB\u52A1\u3002");
            }
          }), { className: "primary", disabled: busy || !sessionId })
        )
      )
    ), document.body)
  );
}
function apply(ctx) {
  ctx.effect(() => {
    const lifetime = new AbortController();
    const remove = ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
      name: "conversation.input.dock",
      id: "workflow-builder",
      order: 110,
      inject: () => ({ sessions: ctx.sessions, lifetime: lifetime.signal })
    }, WorkflowBuilder));
    return () => {
      lifetime.abort();
      remove();
    };
  }, "workflow-builder: conversation entry");
}
return module.exports; } });
