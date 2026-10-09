import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  Home,
  Menu,
  PiggyBank,
  Plus,
  ReceiptText,
  RefreshCw,
  Settings,
  Target,
  Trash2,
  Upload,
  WalletCards,
  X,
} from 'lucide-react'
import './App.css'

const STORAGE_KEY = 'mi-balance-data-v1'

const DEFAULT_DATA = {
  settings: { startingBalance: 0, accumulatedSavings: 0, activeMonth: '' },
  incomes: [],
  fixedExpenses: [],
  savings: [],
  movements: [],
  statuses: {},
  monthClosures: {},
}

const normalizeData = (stored = {}) => {
  const storedSettings = stored.settings ?? {}
  const isLegacyData = !Object.prototype.hasOwnProperty.call(storedSettings, 'accumulatedSavings')

  return {
    ...DEFAULT_DATA,
    ...stored,
    settings: isLegacyData
      ? {
          ...DEFAULT_DATA.settings,
          ...storedSettings,
          startingBalance: 0,
          accumulatedSavings: Number(storedSettings.startingBalance || 0),
        }
      : { ...DEFAULT_DATA.settings, ...storedSettings },
  }
}

const CATEGORY_LABELS = {
  vivienda: 'Vivienda',
  servicios: 'Servicios',
  alimentacion: 'Alimentación',
  transporte: 'Transporte',
  salud: 'Salud',
  entretenimiento: 'Entretenimiento',
  deuda: 'Deudas',
  otros: 'Otros',
}

const NAV_ITEMS = [
  { id: 'summary', label: 'Resumen', icon: Home },
  { id: 'calendar', label: 'Calendario', icon: CalendarDays },
  { id: 'movements', label: 'Movimientos', icon: ReceiptText },
  { id: 'income', label: 'Ingresos', icon: CircleDollarSign },
  { id: 'fixed', label: 'Pagos fijos', icon: RefreshCw },
  { id: 'savings', label: 'Ahorros', icon: PiggyBank },
  { id: 'settings', label: 'Configuración', icon: Settings },
]

const makeId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

const money = new Intl.NumberFormat('es-DO', {
  style: 'currency',
  currency: 'DOP',
  maximumFractionDigits: 0,
})

const formatMoney = (value) => money.format(Number(value) || 0)

function AnimatedMoney({ value, className = '', prefix = '' }) {
  const [displayValue, setDisplayValue] = useState(0)
  const currentValueRef = useRef(0)

  useEffect(() => {
    const target = Number(value) || 0
    const start = currentValueRef.current
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduceMotion || start === target) {
      currentValueRef.current = target
      setDisplayValue(target)
      return undefined
    }

    let animationFrame
    const startedAt = performance.now()
    const duration = 650

    const animate = (timestamp) => {
      const progress = Math.min((timestamp - startedAt) / duration, 1)
      const easedProgress = 1 - (1 - progress) ** 3
      const nextValue = start + (target - start) * easedProgress
      currentValueRef.current = nextValue
      setDisplayValue(nextValue)
      if (progress < 1) animationFrame = window.requestAnimationFrame(animate)
    }

    animationFrame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [value])

  return <strong className={`${className} animated-money`.trim()}>{prefix}{formatMoney(displayValue)}</strong>
}

const monthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

const dateKey = (date) =>
  `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`

const localDate = (value) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const dateForDay = (month, day) => {
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  return new Date(month.getFullYear(), month.getMonth(), Math.min(Number(day), lastDay))
}

const displayDate = (date) =>
  new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'short' }).format(date)

const fullMonth = (date) =>
  new Intl.DateTimeFormat('es-DO', { month: 'long', year: 'numeric' }).format(date)

const emptyForm = (month) => ({
  kind: 'income',
  name: '',
  amount: '',
  recurrence: 'quincenal',
  day: '15',
  secondDay: '30',
  date: dateKey(dateForDay(month, new Date().getDate())),
  category: 'otros',
})

const buildMonthItems = (data, targetMonth) => {
  const result = []
  const currentMonthKey = monthKey(targetMonth)

  data.incomes.forEach((income) => {
    const days = income.frequency === 'quincenal' ? [income.day, income.secondDay] : [income.day]
    days.forEach((day, index) => {
      result.push({
        ...income,
        date: dateForDay(targetMonth, day),
        type: 'income',
        source: 'income',
        key: `${currentMonthKey}:income:${income.id}:${index}`,
      })
    })
  })

  data.fixedExpenses.forEach((expense) => {
    result.push({
      ...expense,
      date: dateForDay(targetMonth, expense.day),
      type: 'expense',
      source: 'fixed',
      key: `${currentMonthKey}:fixed:${expense.id}`,
    })
  })

  data.savings.forEach((saving) => {
    result.push({
      ...saving,
      date: dateForDay(targetMonth, saving.day),
      type: 'saving',
      source: 'saving',
      key: `${currentMonthKey}:saving:${saving.id}`,
    })
  })

  data.movements
    .filter((movement) => movement.date.startsWith(currentMonthKey))
    .forEach((movement) => {
      result.push({
        ...movement,
        date: localDate(movement.date),
        source: 'movement',
        key: `${currentMonthKey}:movement:${movement.id}`,
      })
    })

  return result.sort((a, b) => a.date - b.date)
}

const monthFromKey = (value) => {
  const [year, month] = value.split('-').map(Number)
  return new Date(year, month - 1, 1)
}

const closeElapsedMonths = (data, currentMonth) => {
  const currentKey = monthKey(currentMonth)
  const activeKey = data.settings.activeMonth

  if (!activeKey) {
    return { ...data, settings: { ...data.settings, activeMonth: currentKey } }
  }
  if (activeKey >= currentKey) return data

  const monthClosures = { ...data.monthClosures }
  let accumulatedSavings = Number(data.settings.accumulatedSavings || 0)
  let cursor = monthFromKey(activeKey)

  while (monthKey(cursor) < currentKey) {
    const closingKey = monthKey(cursor)
    if (!monthClosures[closingKey]) {
      const closingItems = buildMonthItems(data, cursor)
      const completedSavings = closingItems
        .filter((item) => item.type === 'saving' && data.statuses[item.key])
        .reduce((sum, item) => sum + item.amount, 0)
      const plannedSavings = closingItems
        .filter((item) => item.type === 'saving')
        .reduce((sum, item) => sum + item.amount, 0)

      accumulatedSavings += completedSavings
      monthClosures[closingKey] = {
        closedAt: new Date().toISOString(),
        savingsAdded: completedSavings,
        plannedSavings,
      }
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }

  return {
    ...data,
    monthClosures,
    settings: { ...data.settings, accumulatedSavings, activeMonth: currentKey },
  }
}

const summarizePeriod = (periodItems) => {
  const income = periodItems
    .filter((item) => item.type === 'income')
    .reduce((sum, item) => sum + item.amount, 0)
  const expenses = periodItems
    .filter((item) => item.type === 'expense')
    .reduce((sum, item) => sum + item.amount, 0)
  const savings = periodItems
    .filter((item) => item.type === 'saving')
    .reduce((sum, item) => sum + item.amount, 0)

  return { income, expenses, savings, available: income - expenses - savings }
}

function App() {
  const [data, setData] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) return DEFAULT_DATA
      return normalizeData(JSON.parse(saved))
    } catch {
      return DEFAULT_DATA
    }
  })
  const [selectedMonth, setSelectedMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  )
  const [activeView, setActiveView] = useState('summary')
  const [modalOpen, setModalOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [projectionMonths, setProjectionMonths] = useState(12)
  const [form, setForm] = useState(() => emptyForm(selectedMonth))
  const fileInputRef = useRef(null)
  const calendarMonthRef = useRef(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])

  useEffect(() => {
    const synchronizeCalendar = () => {
      const now = new Date()
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const currentKey = monthKey(currentMonth)

      setData((current) => closeElapsedMonths(current, currentMonth))
      const previousCalendarMonth = calendarMonthRef.current
      calendarMonthRef.current = currentKey
      if (previousCalendarMonth && previousCalendarMonth !== currentKey) {
        setSelectedMonth(currentMonth)
      }
    }

    synchronizeCalendar()
    window.addEventListener('focus', synchronizeCalendar)
    const timer = window.setInterval(synchronizeCalendar, 60 * 60 * 1000)
    return () => {
      window.removeEventListener('focus', synchronizeCalendar)
      window.clearInterval(timer)
    }
  }, [])

  const items = useMemo(() => buildMonthItems(data, selectedMonth), [data, selectedMonth])

  const payPeriods = useMemo(() => {
    const nextMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1)
    const nextMonthItems = buildMonthItems(data, nextMonth)
    const firstStart = dateForDay(selectedMonth, 15)
    const secondStart = dateForDay(selectedMonth, 30)
    const nextCutoff = dateForDay(nextMonth, 14)
    const firstItems = items.filter((item) => item.date >= firstStart && item.date < secondStart)
    const secondItems = [
      ...items.filter((item) => item.date >= secondStart),
      ...nextMonthItems.filter((item) => item.date <= nextCutoff),
    ]

    return [
      {
        label: 'Quincena del 15',
        range: `15–${secondStart.getDate() - 1} ${new Intl.DateTimeFormat('es-DO', { month: 'short' }).format(selectedMonth)}`,
        ...summarizePeriod(firstItems),
      },
      {
        label: 'Quincena del 30',
        range: `${secondStart.getDate()} ${new Intl.DateTimeFormat('es-DO', { month: 'short' }).format(selectedMonth)} – 14 ${new Intl.DateTimeFormat('es-DO', { month: 'short' }).format(nextMonth)}`,
        ...summarizePeriod(secondItems),
      },
    ]
  }, [data, items, selectedMonth])

  const currentCompletedSavings = useMemo(() => {
    const activeMonth = data.settings.activeMonth
      ? monthFromKey(data.settings.activeMonth)
      : selectedMonth
    return buildMonthItems(data, activeMonth)
      .filter((item) => item.type === 'saving' && data.statuses[item.key])
      .reduce((sum, item) => sum + item.amount, 0)
  }, [data, selectedMonth])

  const savingsProjection = useMemo(() => {
    const startMonth = data.settings.activeMonth
      ? monthFromKey(data.settings.activeMonth)
      : selectedMonth
    const startingTotal = Number(data.settings.accumulatedSavings || 0)

    return Array.from({ length: 12 }).reduce((rows, _, index) => {
      const projectionMonth = new Date(startMonth.getFullYear(), startMonth.getMonth() + index, 1)
      const plannedSavings = buildMonthItems(data, projectionMonth)
        .filter((item) => item.type === 'saving')
        .reduce((sum, item) => sum + item.amount, 0)
      const previousTotal = rows.at(-1)?.total ?? startingTotal
      return [...rows, {
        key: monthKey(projectionMonth),
        label: new Intl.DateTimeFormat('es-DO', { month: 'short' }).format(projectionMonth),
        fullLabel: fullMonth(projectionMonth),
        contribution: plannedSavings,
        total: previousTotal + plannedSavings,
      }]
    }, [])
  }, [data, selectedMonth])

  const totals = useMemo(() => {
    const income = items.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0)
    const expenses = items.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0)
    const savings = items.filter((item) => item.type === 'saving').reduce((sum, item) => sum + item.amount, 0)
    const paidExpenses = items
      .filter((item) => item.type === 'expense' && data.statuses[item.key])
      .reduce((sum, item) => sum + item.amount, 0)
    const saved = items
      .filter((item) => item.type === 'saving' && data.statuses[item.key])
      .reduce((sum, item) => sum + item.amount, 0)
    const received = items
      .filter((item) => item.type === 'income' && data.statuses[item.key])
      .reduce((sum, item) => sum + item.amount, 0)

    return {
      income,
      expenses,
      savings,
      paidExpenses,
      saved,
      accumulatedSavings: Number(data.settings.accumulatedSavings || 0),
      totalSavings: Number(data.settings.accumulatedSavings || 0) + currentCompletedSavings,
      received,
      available: Number(data.settings.startingBalance || 0) + income - expenses - savings,
      actualBalance: Number(data.settings.startingBalance || 0) + received - paidExpenses - saved,
    }
  }, [items, data.statuses, data.settings.startingBalance, data.settings.accumulatedSavings, currentCompletedSavings])

  const selectedSavingsView = useMemo(() => {
    const selectedKey = monthKey(selectedMonth)
    const activeKey = data.settings.activeMonth || selectedKey
    const accumulated = Number(data.settings.accumulatedSavings || 0)

    if (selectedKey === activeKey) {
      const progress = totals.savings ? Math.min((totals.saved / totals.savings) * 100, 100) : 0
      return {
        value: accumulated + currentCompletedSavings,
        title: 'Ahorro actual acumulado',
        detail: `${formatMoney(accumulated)} cerrados + ${formatMoney(currentCompletedSavings)} este mes`,
        mode: 'Actual',
        ring: `${Math.round(progress)}%`,
      }
    }

    if (selectedKey > activeKey) {
      const activeMonth = monthFromKey(activeKey)
      let cursor = activeMonth
      let projectedContributions = 0
      let monthCount = 0

      while (monthKey(cursor) <= selectedKey && monthCount < 240) {
        projectedContributions += buildMonthItems(data, cursor)
          .filter((item) => item.type === 'saving')
          .reduce((sum, item) => sum + item.amount, 0)
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
        monthCount += 1
      }

      return {
        value: accumulated + projectedContributions,
        title: `Ahorro proyectado a ${fullMonth(selectedMonth)}`,
        detail: `${formatMoney(projectedContributions)} en aportes planificados`,
        mode: 'Proyección',
        ring: 'EST.',
      }
    }

    const laterClosedSavings = Object.entries(data.monthClosures)
      .filter(([key]) => key > selectedKey)
      .reduce((sum, [, closure]) => sum + Number(closure.savingsAdded || 0), 0)
    const closure = data.monthClosures[selectedKey]
    const historicalTotal = Math.max(accumulated - laterClosedSavings, 0)

    return {
      value: historicalTotal,
      title: closure ? `Ahorro al cierre de ${fullMonth(selectedMonth)}` : `Ahorro histórico en ${fullMonth(selectedMonth)}`,
      detail: closure
        ? `${formatMoney(closure.savingsAdded)} agregados durante ese mes`
        : 'Este mes es anterior al inicio de los cierres automáticos',
      mode: closure ? 'Cerrado' : 'Histórico',
      ring: closure ? '✓' : '—',
    }
  }, [selectedMonth, data, totals.savings, totals.saved, currentCompletedSavings])

  const openModal = (kind = 'income') => {
    setForm({ ...emptyForm(selectedMonth), kind })
    setModalOpen(true)
  }

  const changeMonth = (amount) => {
    setSelectedMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1))
  }

  const toggleStatus = (key) => {
    setData((current) => {
      const statuses = { ...current.statuses, [key]: !current.statuses[key] }
      const itemMonth = key.slice(0, 7)
      const existingClosure = current.monthClosures[itemMonth]

      if (!existingClosure) return { ...current, statuses }

      const completedSavings = buildMonthItems(current, monthFromKey(itemMonth))
        .filter((item) => item.type === 'saving' && statuses[item.key])
        .reduce((sum, item) => sum + item.amount, 0)
      const savingsDifference = completedSavings - existingClosure.savingsAdded

      return {
        ...current,
        statuses,
        settings: {
          ...current.settings,
          accumulatedSavings: Number(current.settings.accumulatedSavings || 0) + savingsDifference,
        },
        monthClosures: {
          ...current.monthClosures,
          [itemMonth]: { ...existingClosure, savingsAdded: completedSavings },
        },
      }
    })
  }

  const submitMovement = (event) => {
    event.preventDefault()
    const amount = Number(form.amount)
    if (!form.name.trim() || !amount || amount < 0) return

    setData((current) => {
      const next = { ...current }
      if (form.kind === 'income' && form.recurrence !== 'unico') {
        next.incomes = [
          ...current.incomes,
          {
            id: makeId(),
            name: form.name.trim(),
            amount,
            frequency: form.recurrence,
            day: Number(form.day),
            secondDay: Number(form.secondDay),
          },
        ]
      } else if (form.kind === 'fixed') {
        next.fixedExpenses = [
          ...current.fixedExpenses,
          {
            id: makeId(),
            name: form.name.trim(),
            amount,
            day: Number(form.day),
            category: form.category,
          },
        ]
      } else if (form.kind === 'saving' && form.recurrence === 'mensual') {
        next.savings = [
          ...current.savings,
          { id: makeId(), name: form.name.trim(), amount, day: Number(form.day) },
        ]
      } else {
        next.movements = [
          ...current.movements,
          {
            id: makeId(),
            name: form.name.trim(),
            amount,
            date: form.date,
            category: form.category,
            type: form.kind === 'income' ? 'income' : form.kind === 'saving' ? 'saving' : 'expense',
          },
        ]
      }
      return next
    })
    setModalOpen(false)
  }

  const deleteItem = (collection, id) => {
    if (!window.confirm('¿Quieres eliminar este elemento?')) return
    setData((current) => ({
      ...current,
      [collection]: current[collection].filter((item) => item.id !== id),
    }))
  }

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `mi-balance-respaldo-${dateKey(new Date())}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const importData = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result)
        setData(normalizeData(imported))
      } catch {
        window.alert('No pudimos leer este archivo de respaldo.')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const renderPage = () => {
    if (activeView === 'calendar') {
      return <CalendarView month={selectedMonth} items={items} statuses={data.statuses} onToggle={toggleStatus} />
    }

    if (activeView === 'movements') {
      return (
        <section className="content-card movements-page">
          <SectionTitle eyebrow="Este mes" title="Todos los movimientos" action={() => openModal('expense')} />
          <MovementTable items={items} statuses={data.statuses} onToggle={toggleStatus} onDelete={(item) => deleteItem(item.source === 'income' ? 'incomes' : item.source === 'fixed' ? 'fixedExpenses' : item.source === 'saving' ? 'savings' : 'movements', item.id)} />
        </section>
      )
    }

    if (activeView === 'income') {
      return (
        <CollectionPage
          eyebrow="Entradas recurrentes"
          title="Ingresos"
          description="Configura tus quincenas o cualquier otro ingreso mensual."
          buttonLabel="Agregar ingreso"
          onAdd={() => openModal('income')}
          emptyText="Todavía no tienes ingresos configurados."
        >
          <div className="collection-grid">
            {data.incomes.map((item) => (
              <CollectionCard
                key={item.id}
                icon={<CircleDollarSign size={20} />}
                item={item}
                meta={item.frequency === 'quincenal' ? `Días ${item.day} y ${item.secondDay} · por quincena` : `Cada día ${item.day}`}
                onDelete={() => deleteItem('incomes', item.id)}
              />
            ))}
          </div>
        </CollectionPage>
      )
    }

    if (activeView === 'fixed') {
      return (
        <CollectionPage
          eyebrow="Recurrentes"
          title="Pagos fijos"
          description="Estos pagos aparecerán automáticamente todos los meses."
          buttonLabel="Agregar pago"
          onAdd={() => openModal('fixed')}
          emptyText="Todavía no tienes pagos fijos."
        >
          <div className="collection-grid">
            {data.fixedExpenses.map((item) => (
              <CollectionCard
                key={item.id}
                icon={<ReceiptText size={20} />}
                item={item}
                meta={`Día ${item.day} · ${CATEGORY_LABELS[item.category]}`}
                onDelete={() => deleteItem('fixedExpenses', item.id)}
              />
            ))}
          </div>
        </CollectionPage>
      )
    }

    if (activeView === 'savings') {
      const progress = totals.savings ? Math.min((totals.saved / totals.savings) * 100, 100) : 0
      return (
        <CollectionPage
          eyebrow="Tus metas"
          title="Ahorros"
          description="Separa tu ahorro como un compromiso mensual."
          buttonLabel="Nueva meta"
          onAdd={() => openModal('saving')}
          emptyText="Crea tu primera meta de ahorro mensual."
        >
          <div className="savings-hero">
            <div>
              <div className="savings-title-row"><span>{selectedSavingsView.title}</span><b>{selectedSavingsView.mode}</b></div>
              <AnimatedMoney value={selectedSavingsView.value} />
              <small>{selectedSavingsView.detail}</small>
            </div>
            <div className="progress-ring" style={{ '--progress': `${progress * 3.6}deg` }}>
              <span>{selectedSavingsView.ring}</span>
            </div>
          </div>
          <SavingsProjection
            rows={savingsProjection.slice(0, projectionMonths)}
            horizon={projectionMonths}
            onHorizonChange={setProjectionMonths}
          />
          <ClosureHistory closures={data.monthClosures} />
          <div className="goals-heading"><div><span className="eyebrow">APORTES RECURRENTES</span><h3>Metas mensuales</h3></div><span>{formatMoney(totals.savings)} al mes</span></div>
          <div className="collection-grid">
            {data.savings.map((item) => (
              <CollectionCard
                key={item.id}
                icon={<Target size={20} />}
                item={item}
                meta={`Cada día ${item.day}`}
                onDelete={() => deleteItem('savings', item.id)}
              />
            ))}
          </div>
        </CollectionPage>
      )
    }

    if (activeView === 'settings') {
      return (
        <section className="settings-page">
          <div className="content-card">
            <div className="section-heading">
              <div><span className="eyebrow">Preferencias</span><h2>Configuración</h2></div>
            </div>
            <div className="settings-fields">
              <label className="settings-field">
                <span>Saldo disponible al iniciar el mes</span>
                <small>Dinero que sí puedes utilizar para los gastos del mes.</small>
                <div className="money-input"><b>RD$</b><input type="number" min="0" value={data.settings.startingBalance ?? 0} onChange={(event) => setData((current) => ({ ...current, settings: { ...current.settings, startingBalance: Number(event.target.value) } }))} /></div>
              </label>
              <label className="settings-field">
                <span>Ahorro acumulado anterior</span>
                <small>Dinero que ya tenías ahorrado. No se contará como disponible para gastar.</small>
                <div className="money-input"><b>RD$</b><input type="number" min="0" value={data.settings.accumulatedSavings ?? 0} onChange={(event) => setData((current) => ({ ...current, settings: { ...current.settings, accumulatedSavings: Number(event.target.value) } }))} /></div>
              </label>
            </div>
          </div>
          <div className="content-card backup-card">
            <div><span className="eyebrow">Tus datos</span><h2>Copias de seguridad</h2><p>Descarga regularmente un respaldo. Tus datos viven solamente en este navegador.</p></div>
            <div className="backup-actions">
              <button className="secondary-button" onClick={exportData}><Download size={17} /> Exportar</button>
              <button className="secondary-button" onClick={() => fileInputRef.current?.click()}><Upload size={17} /> Importar</button>
              <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={importData} />
            </div>
          </div>
        </section>
      )
    }

    return (
      <Dashboard
        totals={totals}
        savingsView={selectedSavingsView}
        payPeriods={payPeriods}
        items={items}
        statuses={data.statuses}
        hasData={Boolean(data.incomes.length || data.fixedExpenses.length || data.movements.length || data.savings.length)}
        onAdd={openModal}
        onToggle={toggleStatus}
        goTo={setActiveView}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand"><div className="brand-mark"><span>C.</span></div><div><strong>CIFRA</strong><span>Finanzas personales</span></div></div>
        <nav className="top-navigation">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={activeView === id ? 'active' : ''} onClick={() => setActiveView(id)}>
              <Icon size={16} strokeWidth={2} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="header-tools">
          <div className="month-picker">
            <button onClick={() => changeMonth(-1)} aria-label="Mes anterior"><ChevronLeft size={18} /></button>
            <strong>{fullMonth(selectedMonth)}</strong>
            <button onClick={() => changeMonth(1)} aria-label="Mes siguiente"><ChevronRight size={18} /></button>
          </div>
          <button className="header-add" onClick={() => openModal('expense')} aria-label="Nuevo movimiento"><Plus size={18} /></button>
        </div>
        <button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú"><Menu /></button>
      </header>

      {sidebarOpen && <button className="menu-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú" />}
      <aside className={`mobile-menu ${sidebarOpen ? 'open' : ''}`}>
        <div className="mobile-menu-head"><div className="brand"><div className="brand-mark"><span>C.</span></div><div><strong>CIFRA</strong><span>Finanzas personales</span></div></div><button onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú"><X /></button></div>
        <nav>
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={activeView === id ? 'active' : ''} onClick={() => { setActiveView(id); setSidebarOpen(false) }}><Icon size={18} />{label}</button>
          ))}
        </nav>
        <div className="privacy-note"><CircleDollarSign size={18} /><div><strong>Datos privados</strong><span>Guardados solo en este dispositivo</span></div></div>
      </aside>

      <main className="main-area">
        <div className="mobile-toolbar">
          <div className="month-picker">
            <button onClick={() => changeMonth(-1)} aria-label="Mes anterior"><ChevronLeft size={18} /></button>
            <strong>{fullMonth(selectedMonth)}</strong>
            <button onClick={() => changeMonth(1)} aria-label="Mes siguiente"><ChevronRight size={18} /></button>
          </div>
          <button className="header-add" onClick={() => openModal('expense')} aria-label="Nuevo movimiento"><Plus size={18} /></button>
        </div>
        <div className="page-content"><div className="view-transition" key={`${activeView}-${monthKey(selectedMonth)}`}>{renderPage()}</div></div>
      </main>

      {modalOpen && (
        <MovementModal
          form={form}
          setForm={setForm}
          onClose={() => setModalOpen(false)}
          onSubmit={submitMovement}
        />
      )}
    </div>
  )
}

function Dashboard({ totals, savingsView, payPeriods, items, statuses, hasData, onAdd, onToggle, goTo }) {
  const upcoming = items.filter((item) => !statuses[item.key]).slice(0, 5)
  const expensePercent = totals.income ? Math.min(((totals.expenses + totals.savings) / totals.income) * 100, 100) : 0

  return (
    <>
      <section className="welcome-row">
        <div><span className="eyebrow">TU RESUMEN MENSUAL</span><h1>Tu dinero,<br /><em>bajo control.</em></h1><p>Organiza cada quincena, cumple tus metas y disfruta más tranquilidad.</p></div>
        <button className="primary-button mobile-add" onClick={() => onAdd('expense')}><Plus size={18} /> Agregar</button>
      </section>

      {!hasData && (
        <section className="setup-banner">
          <div className="setup-icon"><WalletCards /></div>
          <div><strong>Empieza agregando tus ingresos</strong><p>Registra tus dos quincenas para calcular cuánto puedes gastar y ahorrar.</p></div>
          <button onClick={() => onAdd('income')}>Configurar ingresos <ArrowRight size={17} /></button>
        </section>
      )}

      <section className="balance-hero">
        <div className="hero-balance">
          <span>Disponible al finalizar el mes</span>
          <AnimatedMoney value={totals.available} className={totals.available < 0 ? 'negative' : ''} />
          <small>Balance confirmado &nbsp; / &nbsp; {formatMoney(totals.actualBalance)}</small>
        </div>
        <div className="hero-metrics">
          <div><span>Ingresos</span><AnimatedMoney value={totals.income} /><small>{formatMoney(totals.received)} recibidos</small></div>
          <div><span>Gastos</span><AnimatedMoney value={totals.expenses} /><small>{formatMoney(totals.paidExpenses)} pagados</small></div>
          <div><span>{savingsView.mode === 'Proyección' ? 'Ahorro proyectado' : 'Ahorro total'}</span><AnimatedMoney value={savingsView.value} /><small>{savingsView.mode}</small></div>
        </div>
      </section>

      <section className="pay-periods-section">
        <div className="pay-periods-heading">
          <div><span className="eyebrow">PRESUPUESTO QUINCENAL</span><h2>Dos quincenas, un solo plan.</h2></div>
          <p>Los compromisos se asignan automáticamente según su fecha.</p>
        </div>
        <div className="pay-periods-grid">
          {payPeriods.map((period, index) => <PayPeriodCard key={period.label} period={period} index={index} />)}
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="content-card balance-card">
          <div className="section-heading"><div><span className="eyebrow">DISTRIBUCIÓN</span><h2>Plan del mes</h2></div></div>
          <div className="balance-visual">
            <div className="balance-main"><span>Después de compromisos</span><AnimatedMoney value={totals.available} /><small>{Math.round(100 - expensePercent)}% de tus ingresos queda disponible</small></div>
            <div className="donut" style={{ '--used': `${expensePercent * 3.6}deg` }}><div><strong>{Math.round(expensePercent)}%</strong><span>asignado</span></div></div>
          </div>
          <div className="allocation-bar"><span style={{ width: `${totals.income ? (totals.expenses / totals.income) * 100 : 0}%` }} /><span style={{ width: `${totals.income ? (totals.savings / totals.income) * 100 : 0}%` }} /></div>
          <div className="allocation-legend"><span><i className="expense-dot" /> Gastos {formatMoney(totals.expenses)}</span><span><i className="saving-dot" /> Ahorros {formatMoney(totals.savings)}</span></div>
        </div>

        <div className="content-card upcoming-card">
          <div className="section-heading"><div><span className="eyebrow">PENDIENTES</span><h2>Próximos movimientos</h2></div><button className="text-button" onClick={() => goTo('movements')}>Ver todos</button></div>
          {upcoming.length ? (
            <div className="upcoming-list">
              {upcoming.map((item) => <MovementRow key={item.key} item={item} done={statuses[item.key]} onToggle={() => onToggle(item.key)} />)}
            </div>
          ) : <EmptyState icon={<Check />} text="Todo está al día este mes." />}
        </div>
      </section>
    </>
  )
}

function PayPeriodCard({ period, index }) {
  return (
    <article className={`pay-period-card period-${index + 1}`}>
      <span className="period-index">0{index + 1}</span>
      <div className="pay-period-top">
        <div className="pay-period-icon"><CalendarDays size={19} /></div>
        <div><strong>{period.label}</strong><span>{period.range}</span></div>
        <div className={`period-available ${period.available < 0 ? 'negative' : ''}`}><span>Disponible</span><AnimatedMoney value={period.available} /></div>
      </div>
      <div className="period-breakdown">
        <span><i className="income-dot" /> Ingresos <b>{formatMoney(period.income)}</b></span>
        <span><i className="expense-dot" /> Gastos <b>−{formatMoney(period.expenses)}</b></span>
        <span><i className="saving-dot" /> Ahorro <b>−{formatMoney(period.savings)}</b></span>
      </div>
    </article>
  )
}

function SavingsProjection({ rows, horizon, onHorizonChange }) {
  const maxTotal = Math.max(...rows.map((row) => row.total), 1)
  const finalTotal = rows.at(-1)?.total ?? 0
  const totalContributions = rows.reduce((sum, row) => sum + row.contribution, 0)

  return (
    <section className="projection-card">
      <div className="projection-header">
        <div><span className="eyebrow">PROYECCIÓN</span><h3>Así crecerían tus ahorros</h3><p>Estimación suponiendo que completas todos tus aportes planificados.</p></div>
        <div className="horizon-selector" aria-label="Plazo de proyección">
          {[3, 6, 9, 12].map((months) => <button key={months} className={horizon === months ? 'active' : ''} onClick={() => onHorizonChange(months)}>{months}M</button>)}
        </div>
      </div>
      <div className="projection-summary">
        <div><span>Estimado en {horizon} meses</span><AnimatedMoney value={finalTotal} /></div>
        <div><span>Aportes proyectados</span><AnimatedMoney value={totalContributions} prefix="+" /></div>
      </div>
      <div className="projection-chart" aria-label={`Proyección de ahorro a ${horizon} meses`}>
        {rows.map((row) => (
          <div className="projection-column" key={row.key} title={`${row.fullLabel}: ${formatMoney(row.total)}`}>
            <div className="bar-track"><div className="projection-bar" style={{ height: `${Math.max((row.total / maxTotal) * 100, 4)}%` }}><span>{formatMoney(row.total)}</span></div></div>
            <small>{row.label}</small>
          </div>
        ))}
      </div>
      <div className="projection-table">
        <div className="projection-table-head"><span>Mes</span><span>Aporte</span><span>Total estimado</span></div>
        {rows.map((row) => <div key={row.key}><span>{row.fullLabel}</span><span>+{formatMoney(row.contribution)}</span><strong>{formatMoney(row.total)}</strong></div>)}
      </div>
    </section>
  )
}

function ClosureHistory({ closures }) {
  const entries = Object.entries(closures).sort(([a], [b]) => b.localeCompare(a)).slice(0, 6)
  if (!entries.length) return <div className="closure-note"><RefreshCw size={17} /><div><strong>Cierre mensual automático activo</strong><span>Al comenzar el próximo mes, el ahorro completado se agregará al acumulado.</span></div></div>

  return (
    <section className="closure-history">
      <div><span className="eyebrow">HISTORIAL</span><h3>Cierres mensuales</h3></div>
      <div className="closure-list">
        {entries.map(([key, closure]) => <div key={key}><span>{fullMonth(monthFromKey(key))}</span><small>{formatMoney(closure.plannedSavings)} planificados</small><strong>+{formatMoney(closure.savingsAdded)}</strong></div>)}
      </div>
    </section>
  )
}

function MovementRow({ item, done, onToggle, onDelete }) {
  return (
    <div className={`movement-row ${done ? 'done' : ''}`}>
      <button className={`status-check ${done ? 'checked' : ''}`} onClick={onToggle} aria-label={done ? 'Marcar pendiente' : 'Marcar realizado'}>{done && <Check size={14} />}</button>
      <div className={`movement-icon ${item.type}`}>
        {item.type === 'income' ? <ArrowDownLeft /> : item.type === 'saving' ? <PiggyBank /> : <ReceiptText />}
      </div>
      <div className="movement-info"><strong>{item.name}</strong><span>{displayDate(item.date)} · {item.source === 'fixed' ? CATEGORY_LABELS[item.category] : item.type === 'saving' ? 'Ahorro' : item.type === 'income' ? 'Ingreso' : CATEGORY_LABELS[item.category]}</span></div>
      <strong className={`movement-amount ${item.type}`}>{item.type === 'income' ? '+' : '−'}{formatMoney(item.amount)}</strong>
      {onDelete && <button className="row-delete" onClick={onDelete} aria-label={`Eliminar ${item.name}`}><Trash2 size={15} /></button>}
    </div>
  )
}

function MovementTable({ items, statuses, onToggle, onDelete }) {
  if (!items.length) return <EmptyState icon={<ReceiptText />} text="No hay movimientos para este mes." />
  return <div className="movement-table">{items.map((item) => <MovementRow key={item.key} item={item} done={statuses[item.key]} onToggle={() => onToggle(item.key)} onDelete={onDelete ? () => onDelete(item) : undefined} />)}</div>
}

function CalendarView({ month, items, statuses, onToggle }) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const mondayOffset = (firstDay.getDay() + 6) % 7
  const cells = [...Array(mondayOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)]
  while (cells.length % 7) cells.push(null)

  return (
    <section className="content-card calendar-card">
      <div className="section-heading"><div><span className="eyebrow">FECHAS IMPORTANTES</span><h2>Calendario financiero</h2></div></div>
      <div className="calendar-weekdays">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">
        {cells.map((day, index) => {
          const dayItems = day ? items.filter((item) => item.date.getDate() === day) : []
          return <div key={`${day}-${index}`} className={`calendar-day ${day ? '' : 'blank'}`}><span>{day}</span>{dayItems.map((item) => <button key={item.key} className={`${item.type} ${statuses[item.key] ? 'done' : ''}`} onClick={() => onToggle(item.key)} title={`${item.name}: ${formatMoney(item.amount)}`}>{item.name}<small>{formatMoney(item.amount)}</small></button>)}</div>
        })}
      </div>
    </section>
  )
}

function CollectionPage({ eyebrow, title, description, buttonLabel, onAdd, emptyText, children }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : children?.props?.children?.length > 0
  return (
    <section className="content-card collection-page">
      <div className="section-heading collection-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div><button className="primary-button" onClick={onAdd}><Plus size={17} /> {buttonLabel}</button></div>
      {hasChildren ? children : <EmptyState icon={<ReceiptText />} text={emptyText} />}
    </section>
  )
}

function CollectionCard({ icon, item, meta, onDelete }) {
  return (
    <article className="collection-card"><div className="collection-icon">{icon}</div><div><strong>{item.name}</strong><span>{meta}</span></div><b>{formatMoney(item.amount)}</b><button onClick={onDelete} aria-label="Eliminar"><Trash2 size={17} /></button></article>
  )
}

function EmptyState({ icon, text }) {
  return <div className="empty-state"><div>{icon}</div><p>{text}</p></div>
}

function SectionTitle({ eyebrow, title, action }) {
  return <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button className="primary-button" onClick={action}><Plus size={17} /> Agregar</button></div>
}

function MovementModal({ form, setForm, onClose, onSubmit }) {
  const isRecurringIncome = form.kind === 'income' && form.recurrence !== 'unico'
  const usesDay = form.kind === 'fixed' || (form.kind === 'saving' && form.recurrence === 'mensual') || isRecurringIncome
  const usesDate = form.kind === 'expense' || (form.kind === 'saving' && form.recurrence === 'unico') || (form.kind === 'income' && form.recurrence === 'unico')
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header"><div><span className="eyebrow">NUEVO REGISTRO</span><h2 id="modal-title">Agrega un movimiento</h2></div><button onClick={onClose} aria-label="Cerrar"><X /></button></div>
        <form onSubmit={onSubmit}>
          <div className="type-selector">
            {[['income', 'Ingreso'], ['fixed', 'Pago fijo'], ['expense', 'Gasto'], ['saving', 'Ahorro']].map(([value, label]) => <button type="button" key={value} className={form.kind === value ? 'active' : ''} onClick={() => setForm((current) => ({ ...current, kind: value, recurrence: value === 'income' ? 'quincenal' : value === 'saving' ? 'mensual' : current.recurrence }))}>{label}</button>)}
          </div>
          <label><span>Nombre</span><input autoFocus required value={form.name} onChange={update('name')} placeholder={form.kind === 'income' ? 'Ej. Salario' : form.kind === 'saving' ? 'Ej. Fondo de emergencia' : 'Ej. Internet'} /></label>
          <label><span>Monto {form.kind === 'income' && form.recurrence === 'quincenal' ? 'por quincena' : ''}</span><div className="money-input"><b>RD$</b><input required type="number" min="1" step="0.01" value={form.amount} onChange={update('amount')} placeholder="0" /></div></label>

          {form.kind === 'income' && <label><span>Frecuencia</span><select value={form.recurrence} onChange={update('recurrence')}><option value="quincenal">Quincenal</option><option value="mensual">Mensual</option><option value="unico">Solo una vez</option></select></label>}
          {form.kind === 'saving' && <label><span>Frecuencia</span><select value={form.recurrence} onChange={update('recurrence')}><option value="mensual">Todos los meses</option><option value="unico">Solo una vez</option></select></label>}

          {usesDay && <div className="form-row"><label><span>{form.recurrence === 'quincenal' ? 'Primera fecha' : 'Día del mes'}</span><input required type="number" min="1" max="31" value={form.day} onChange={update('day')} /></label>{form.kind === 'income' && form.recurrence === 'quincenal' && <label><span>Segunda fecha</span><input required type="number" min="1" max="31" value={form.secondDay} onChange={update('secondDay')} /></label>}</div>}
          {usesDate && <label><span>Fecha</span><input required type="date" value={form.date} onChange={update('date')} /></label>}
          {(form.kind === 'fixed' || form.kind === 'expense') && <label><span>Categoría</span><select value={form.category} onChange={update('category')}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}

          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button">Guardar movimiento</button></div>
        </form>
      </div>
    </div>
  )
}

export default App
