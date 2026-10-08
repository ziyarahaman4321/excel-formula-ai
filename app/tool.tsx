"use client";

import { useMemo, useState } from "react";
import {
  LIMITS,
  PRO_TARGETS,
  TARGETS,
  TARGET_LABELS,
  type FormulaAnswer,
  type Mode,
  type Plan,
  type Target,
} from "@/lib/formula";
import { useStored } from "@/lib/useStored";

interface Props {
  freeLimit: number;
  proLimit: number;
  proPrice: string;
  checkoutUrl: string;
  licensesEnabled: boolean;
}

interface Usage {
  plan: Plan;
  used: number;
  limit: number;
}

interface HistoryItem {
  id: number;
  mode: Mode;
  target: Target;
  description: string;
  answer: FormulaAnswer;
}

const KEY_STORE = "efa:license";
const HISTORY_STORE = "efa:history";
const HISTORY_MAX = 20;

const MODE_COPY: Record<
  Mode,
  { tab: string; button: string; placeholder: string; examples: string[] }
> = {
  generate: {
    tab: "Create",
    button: "Get formula",
    placeholder:
      "Describe what you need. Example: sum column B where column A equals 'Saudi Arabia'",
    examples: [
      "Sum column B where column A is 'Saudi'",
      "Lookup customer name by ID from sheet 2",
      "Extract unique values from column C",
      "Days between two dates, excluding weekends",
    ],
  },
  explain: {
    tab: "Explain",
    button: "Explain it",
    placeholder:
      "Paste a formula you want explained. Example: =INDEX(C:C,MATCH(1,(A:A=F1)*(B:B=G1),0))",
    examples: [
      "=INDEX(C:C,MATCH(1,(A:A=F1)*(B:B=G1),0))",
      '=IFERROR(VLOOKUP(A2,Sheet2!A:D,4,FALSE),"")',
      "=SUMPRODUCT((A2:A100=E1)*(B2:B100))",
    ],
  },
  fix: {
    tab: "Fix",
    button: "Fix it",
    placeholder:
      "Paste the formula and say what goes wrong. Example: =VLOOKUP(A2,Sheet2!A:B,3,FALSE) gives #REF!",
    examples: [
      "=VLOOKUP(A2,Sheet2!A:B,3,FALSE) gives #REF!",
      "=SUM(A1:A10) returns 0 but the cells have numbers",
      '=IF(A1>10,"High",IF(A1>5,"Mid") shows an error',
    ],
  },
};

function readHistory(raw: string | null): HistoryItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

export default function Tool({
  freeLimit,
  proLimit,
  proPrice,
  checkoutUrl,
  licensesEnabled,
}: Props) {
  const [mode, setMode] = useState<Mode>("generate");
  const [target, setTarget] = useState<Target>("excel");
  const [input, setInput] = useState("");
  const [sample, setSample] = useState("");
  const [showSample, setShowSample] = useState(false);

  const [answer, setAnswer] = useState<FormulaAnswer | null>(null);
  const [answerTarget, setAnswerTarget] = useState<Target>("excel");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);

  const [licenseKey, setLicenseKey] = useStored(KEY_STORE);
  const [keyDraft, setKeyDraft] = useState("");
  const [keyError, setKeyError] = useState("");
  const [keyChecking, setKeyChecking] = useState(false);

  const [historyRaw, setHistoryRaw] = useStored(HISTORY_STORE);
  const history = useMemo(() => readHistory(historyRaw), [historyRaw]);

  const isPro = licensesEnabled && Boolean(licenseKey);
  const plan: Plan = isPro ? "pro" : "free";
  const maxInput = LIMITS[plan].description;
  const copy = MODE_COPY[mode];
  // Pro features are only shown when licence keys can actually be verified.
  const proOffered = licensesEnabled;
  const visibleTargets = TARGETS.filter(
    (t) => isPro || proOffered || !PRO_TARGETS.includes(t)
  );

  function goToPricing() {
    document
      .getElementById("pricing")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function chooseTarget(next: Target) {
    if (!isPro && PRO_TARGETS.includes(next)) {
      setError(`${TARGET_LABELS[next]} is a Pro feature.`);
      setErrorCode("pro_required");
      return;
    }
    setTarget(next);
  }

  async function submit() {
    const description = input.trim();
    if (!description || loading) return;

    setLoading(true);
    setError("");
    setErrorCode("");
    setNotice("");
    setAnswer(null);
    setCopied(false);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(isPro && licenseKey ? { "x-license-key": licenseKey } : {}),
        },
        body: JSON.stringify({
          mode,
          target,
          description,
          sample: isPro && showSample ? sample : "",
        }),
      });
      const data = await res.json();

      if (data.usage) setUsage(data.usage as Usage);

      if (!res.ok || data.error) {
        setError(data.error || "Something went wrong. Try again.");
        setErrorCode(data.code || "");
      } else {
        const next: FormulaAnswer = {
          formula: data.formula || "",
          explanation: data.explanation || "",
          steps: Array.isArray(data.steps) ? data.steps : [],
          alternatives: Array.isArray(data.alternatives)
            ? data.alternatives
            : [],
          warning: data.warning || "",
        };
        setAnswer(next);
        setAnswerTarget(target);
        setNotice(data.notice || "");

        const item: HistoryItem = {
          id: Date.now(),
          mode,
          target,
          description,
          answer: next,
        };
        setHistoryRaw(
          JSON.stringify([item, ...history].slice(0, HISTORY_MAX))
        );
      }
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    }
    setLoading(false);
  }

  async function copyFormula() {
    if (!answer?.formula) return;
    try {
      await navigator.clipboard.writeText(answer.formula);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Select the text and copy it manually.");
    }
  }

  async function activateKey() {
    const key = keyDraft.trim();
    if (!key || keyChecking) return;
    setKeyChecking(true);
    setKeyError("");
    try {
      const res = await fetch("/api/license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (data.valid) {
        setLicenseKey(key);
        setKeyDraft("");
        setUsage(null);
        setError("");
        setErrorCode("");
      } else {
        setKeyError(data.error || "That key isn't valid.");
      }
    } catch {
      setKeyError("Couldn't check the key. Try again.");
    }
    setKeyChecking(false);
  }

  function removeKey() {
    setLicenseKey(null);
    setUsage(null);
    setError("");
    setErrorCode("");
    if (PRO_TARGETS.includes(target)) setTarget("excel");
    setShowSample(false);
  }

  function restore(item: HistoryItem) {
    setMode(item.mode);
    if (isPro || !PRO_TARGETS.includes(item.target)) setTarget(item.target);
    setInput(item.description);
    setAnswer(item.answer);
    setAnswerTarget(item.target);
    setError("");
    setErrorCode("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const remaining = usage ? Math.max(usage.limit - usage.used, 0) : null;
  const isCode = answerTarget === "vba" || answerTarget === "powerquery";
  const showUpsell =
    proOffered &&
    !isPro &&
    (errorCode === "limit_reached" || errorCode === "pro_required");

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4 sm:p-8 text-gray-900">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-end mb-4 h-7">
          {isPro ? (
            <span className="text-xs font-semibold bg-black text-white px-3 py-1 rounded-full">
              Pro
            </span>
          ) : proOffered ? (
            <button
              onClick={goToPricing}
              className="text-xs font-semibold border border-gray-300 hover:border-black px-3 py-1 rounded-full"
            >
              Upgrade to Pro
            </button>
          ) : null}
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold mb-3 text-center">
          Excel Formula AI
        </h1>
        <p className="text-gray-600 text-center mb-10 text-lg">
          Create, explain and fix formulas for Excel and Google Sheets in plain
          English.
        </p>

        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200">
          {/* Mode tabs */}
          <div
            className="grid grid-cols-3 gap-1 bg-gray-100 p-1 rounded-lg mb-4"
            role="group"
            aria-label="What do you want to do?"
          >
            {(Object.keys(MODE_COPY) as Mode[]).map((m) => (
              <button
                key={m}
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`py-2 rounded-md text-sm font-semibold ${
                  mode === m
                    ? "bg-white shadow text-gray-900"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {MODE_COPY[m].tab}
              </button>
            ))}
          </div>

          {/* Target */}
          <p
            id="target-label"
            className="text-xs font-semibold text-gray-500 mb-1"
          >
            For
          </p>
          <div
            className="flex flex-wrap gap-2 mb-4"
            role="group"
            aria-labelledby="target-label"
          >
            {visibleTargets.map((t) => {
              const locked = !isPro && PRO_TARGETS.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => chooseTarget(t)}
                  aria-pressed={target === t}
                  className={`text-sm px-3 py-1.5 rounded-lg border ${
                    target === t
                      ? "bg-black text-white border-black"
                      : "bg-white text-gray-700 border-gray-300 hover:border-black"
                  }`}
                >
                  {TARGET_LABELS[t]}
                  {locked && (
                    <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-600">
                      Pro
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={copy.placeholder}
            aria-label={copy.placeholder}
            className="w-full p-4 border border-gray-300 rounded-lg h-28 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black resize-none"
            maxLength={maxInput}
          />
          <div className="text-xs text-gray-400 text-right mt-1">
            {input.length} / {maxInput}
          </div>

          {/* Sample data (Pro) */}
          {isPro ? (
            <div className="mt-2">
              <button
                onClick={() => setShowSample(!showSample)}
                className="text-sm text-gray-700 underline underline-offset-2"
              >
                {showSample ? "Hide sample data" : "Add sample data"}
              </button>
              {showSample && (
                <>
                  <textarea
                    value={sample}
                    onChange={(e) => setSample(e.target.value)}
                    placeholder="Paste your header row and a few rows straight from the sheet. The formula will use your real columns."
                    aria-label="Sample data"
                    className="w-full mt-2 p-3 border border-gray-300 rounded-lg h-24 bg-white text-gray-900 placeholder:text-gray-400 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-black resize-none"
                    maxLength={LIMITS.pro.sample}
                  />
                  <div className="text-xs text-gray-400 text-right mt-1">
                    {sample.length} / {LIMITS.pro.sample}
                  </div>
                </>
              )}
            </div>
          ) : proOffered ? (
            <button
              onClick={goToPricing}
              className="mt-2 text-sm text-gray-500 hover:text-gray-900"
            >
              Add sample data{" "}
              <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600">
                Pro
              </span>
            </button>
          ) : null}

          <button
            onClick={submit}
            disabled={loading || !input.trim()}
            className="w-full mt-4 bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Thinking..." : copy.button}
          </button>

          <p className="text-xs text-gray-500 text-center mt-2" aria-live="polite">
            {remaining !== null
              ? `${remaining} of ${usage?.limit} answers left today`
              : isPro
                ? `Pro: up to ${proLimit} answers a day`
                : `${freeLimit} free answers a day. No sign-up.`}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {copy.examples.map((ex) => (
              <button
                key={ex}
                onClick={() => setInput(ex)}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-left break-all"
              >
                {ex}
              </button>
            ))}
          </div>

          {error && (
            <div
              role="alert"
              className="mt-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg"
            >
              <p>{error}</p>
              {showUpsell && (
                <button
                  onClick={goToPricing}
                  className="mt-3 bg-black text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-800"
                >
                  See Pro
                </button>
              )}
              {errorCode === "license_invalid" && (
                <button
                  onClick={removeKey}
                  className="mt-3 bg-white border border-red-300 text-red-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-100"
                >
                  Remove key and use the free plan
                </button>
              )}
            </div>
          )}

          {notice && (
            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg">
              {notice}
            </div>
          )}

          {answer && (
            <div className="mt-6 space-y-4">
              {answer.formula && (
                <div className="p-4 pr-16 bg-gray-900 text-green-400 rounded-lg font-mono text-sm relative">
                  <pre className="whitespace-pre-wrap break-words">
                    <code>{answer.formula}</code>
                  </pre>
                  <button
                    onClick={copyFormula}
                    className="absolute top-2 right-2 text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              )}

              {answer.explanation && (
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
                  <p className="text-sm font-semibold text-blue-900 mb-1">
                    What it does
                  </p>
                  <p className="text-sm text-blue-800">{answer.explanation}</p>
                </div>
              )}

              {answer.steps.length > 0 && (
                <div className="p-4 bg-purple-50 border border-purple-100 rounded-lg">
                  <p className="text-sm font-semibold text-purple-900 mb-2">
                    {isCode || !answer.formula ? "How to do it" : "Step by step"}
                  </p>
                  <ol className="text-sm text-purple-800 space-y-1 list-decimal list-inside">
                    {answer.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              {answer.alternatives.length > 0 && (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-sm font-semibold text-gray-900 mb-2">
                    Other ways
                  </p>
                  <ul className="space-y-2">
                    {answer.alternatives.map((alt, i) => (
                      <li
                        key={i}
                        className="text-sm font-mono bg-white text-gray-800 p-2 rounded border border-gray-200 whitespace-pre-wrap break-words"
                      >
                        {alt}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {answer.warning && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm font-semibold text-yellow-900 mb-1">
                    Note
                  </p>
                  <p className="text-sm text-yellow-800">{answer.warning}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* History */}
        {history.length > 0 && (
          <section className="mt-8" aria-labelledby="history-heading">
            <div className="flex items-baseline justify-between mb-2">
              <h2 id="history-heading" className="text-sm font-semibold">
                Recent answers
              </h2>
              <button
                onClick={() => setHistoryRaw(null)}
                className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2"
              >
                Clear
              </button>
            </div>
            <ul className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {history.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => restore(item)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50"
                  >
                    <span className="block text-sm text-gray-800 truncate">
                      {item.description}
                    </span>
                    <span className="block text-xs text-gray-400 font-mono truncate">
                      {item.answer.formula ||
                        item.answer.explanation ||
                        TARGET_LABELS[item.target]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-400 mt-2">
              Saved in this browser only.
            </p>
          </section>
        )}

        {/* Pricing */}
        {(proOffered || isPro) && (
          <section
            id="pricing"
            className="mt-12 scroll-mt-6"
            aria-labelledby="pricing-heading"
          >
            <h2
              id="pricing-heading"
              className="text-2xl font-bold text-center mb-6"
            >
              Pricing
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-white border border-gray-200 rounded-2xl p-6">
                <h3 className="font-semibold">Free</h3>
                <p className="text-3xl font-bold mt-2">$0</p>
                <ul className="mt-4 space-y-2 text-sm text-gray-700">
                  <li>{freeLimit} answers a day</li>
                  <li>Excel and Google Sheets</li>
                  <li>Create, explain and fix formulas</li>
                  <li>No sign-up</li>
                </ul>
              </div>

              <div className="bg-white border-2 border-black rounded-2xl p-6">
                <h3 className="font-semibold">Pro</h3>
                <p className="text-3xl font-bold mt-2">{proPrice}</p>
                <ul className="mt-4 space-y-2 text-sm text-gray-700">
                  <li>Up to {proLimit} answers a day</li>
                  <li>VBA macros and Power Query (M)</li>
                  <li>Paste sample rows for formulas that fit your real columns</li>
                  <li>
                    Longer requests (up to{" "}
                    {LIMITS.pro.description.toLocaleString("en-US")} characters)
                  </li>
                </ul>

                {isPro ? (
                  <div className="mt-6">
                    <p className="text-sm font-semibold text-green-700">
                      Pro is active in this browser.
                    </p>
                    <button
                      onClick={removeKey}
                      className="mt-2 text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2"
                    >
                      Remove licence key
                    </button>
                  </div>
                ) : (
                  <>
                    {checkoutUrl ? (
                      <a
                        href={checkoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-6 block text-center bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800"
                      >
                        Get Pro
                      </a>
                    ) : (
                      <p className="mt-6 text-center text-sm text-gray-500 py-3 border border-dashed border-gray-300 rounded-lg">
                        Launching soon
                      </p>
                    )}
                    <div className="mt-5 pt-5 border-t border-gray-200">
                      <label
                        htmlFor="license-key"
                        className="block text-xs font-semibold text-gray-600 mb-1"
                      >
                        Already bought? Enter your licence key
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="license-key"
                          value={keyDraft}
                          onChange={(e) => setKeyDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") activateKey();
                          }}
                          placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                          autoComplete="off"
                          spellCheck={false}
                          className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder:text-gray-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-black"
                        />
                        <button
                          onClick={activateKey}
                          disabled={keyChecking || !keyDraft.trim()}
                          className="px-4 py-2 border border-black rounded-lg text-sm font-semibold hover:bg-gray-100 disabled:opacity-50"
                        >
                          {keyChecking ? "Checking..." : "Activate"}
                        </button>
                      </div>
                      {keyError && (
                        <p role="alert" className="text-xs text-red-600 mt-2">
                          {keyError}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        <p className="text-center text-xs text-gray-400 mt-10">
          Built with Claude
        </p>
      </div>
    </main>
  );
}
