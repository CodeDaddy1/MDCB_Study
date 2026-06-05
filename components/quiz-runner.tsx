'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'

export interface QuizQuestion {
  id: string
  prompt: string
  options: string[]
  rationales: string[]
  correctIndex: number
  explanation: string
}

export function QuizRunner({ questions }: { questions: QuizQuestion[] }) {
  const [i, setI] = useState(0)
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    questions.map(() => null),
  )
  const [done, setDone] = useState(false)

  if (questions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No verified questions yet — generate some from the deck page first.
      </p>
    )
  }

  const score = answers.filter(
    (a, idx) => a !== null && a === questions[idx].correctIndex,
  ).length

  if (done) {
    return (
      <div className="space-y-6">
        <div className="rounded-[var(--radius-lg)] border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Your score</p>
          <p className="mt-1 text-3xl font-semibold text-foreground">
            {score} / {questions.length}
          </p>
          <button
            onClick={() => {
              setAnswers(questions.map(() => null))
              setI(0)
              setDone(false)
            }}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Retake
          </button>
        </div>
        <ol className="space-y-3">
          {questions.map((q, idx) => {
            const a = answers[idx]
            const correct = a === q.correctIndex
            return (
              <li
                key={q.id}
                className="rounded-[var(--radius-lg)] border border-border bg-card p-4"
              >
                <div className="flex items-start gap-2">
                  <Badge ok={correct} />
                  <p className="text-sm font-medium text-foreground">
                    {idx + 1}. {q.prompt}
                  </p>
                </div>
                <p className="mt-2 pl-7 text-sm text-muted-foreground">
                  Correct: <span className="text-foreground">{q.options[q.correctIndex]}</span>
                  {a !== null && !correct && (
                    <>
                      {' · '}You chose:{' '}
                      <span className="text-destructive">{q.options[a]}</span>
                    </>
                  )}
                </p>
              </li>
            )
          })}
        </ol>
      </div>
    )
  }

  const q = questions[i]
  const selected = answers[i]
  const revealed = selected !== null

  const choose = (idx: number) => {
    if (revealed) return
    setAnswers((prev) => {
      const n = [...prev]
      n[i] = idx
      return n
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Question {i + 1} of {questions.length}
        </span>
        <span>Score: {score}</span>
      </div>

      <h2 className="text-lg font-medium text-foreground">{q.prompt}</h2>

      <ul className="space-y-2">
        {q.options.map((opt, idx) => {
          const isCorrect = idx === q.correctIndex
          const isChosen = idx === selected
          let cls = 'border-border bg-card hover:border-ring'
          if (revealed) {
            if (isCorrect) cls = 'border-success bg-success/10'
            else if (isChosen) cls = 'border-destructive bg-destructive/10'
            else cls = 'border-border bg-card opacity-70'
          }
          return (
            <li key={idx}>
              <button
                onClick={() => choose(idx)}
                disabled={revealed}
                className={`w-full rounded-md border px-4 py-3 text-left text-sm transition ${cls} ${
                  revealed ? 'cursor-default' : 'cursor-pointer'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-foreground">{opt}</span>
                  {revealed && isCorrect && (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  )}
                  {revealed && isChosen && !isCorrect && (
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                </div>
                {revealed && (
                  <p
                    className={`mt-1.5 text-xs ${
                      isCorrect ? 'text-success' : 'text-muted-foreground'
                    }`}
                  >
                    {isCorrect ? 'Why correct: ' : 'Why wrong: '}
                    {q.rationales[idx] ?? ''}
                  </p>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {revealed && (
        <>
          <div className="rounded-md bg-muted px-4 py-3 text-sm text-foreground">
            <span className="font-medium">Key point: </span>
            {q.explanation}
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => (i + 1 < questions.length ? setI(i + 1) : setDone(true))}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              {i + 1 < questions.length ? 'Next question' : 'Finish'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Badge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success/15 text-success">
      <Check className="h-3.5 w-3.5" />
    </span>
  ) : (
    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
      <X className="h-3.5 w-3.5" />
    </span>
  )
}
