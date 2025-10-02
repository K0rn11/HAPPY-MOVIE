import 'dotenv/config'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import QRCode from 'qrcode'

const app = express()
const prisma = new PrismaClient()
const orm: any = prisma as any 

app.set('json replacer', (_key: string, value: any) =>
  typeof value === 'bigint' ? value.toString() : value
)

;(BigInt.prototype as any).toJSON = function () {
  return this.toString()
}

const allowlist = new Set<string>([
  'http://localhost:5173',
  'https://<GORN>.vercel.app',
  process.env.FRONTEND_ORIGIN || '',
].filter(Boolean))

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true) // allow tools/curl
    cb(null, allowlist.has(origin))
  },
  credentials: true
}))
app.use((req, res, next) => {
  const origin = req.headers.origin || ''
  if (allowlist.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin)
    res.header('Access-Control-Allow-Credentials', 'true')
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
app.use(bodyParser.json({ limit: '1mb' }))

/* ================= utils/auth ================= */
type JwtUser = { uid: number; email: string }
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me'

function signToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

function auth(req: Request & { user?: JwtUser }, res: Response, next: NextFunction) {
  try {
    const h = req.headers.authorization || ''
    const token = h.startsWith('Bearer ') ? h.slice(7) : null
    if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' })
    const decoded = jwt.verify(token, JWT_SECRET) as any
    req.user = { uid: decoded.uid, email: decoded.email }
    next()
  } catch {
    return res.status(401).json({ ok: false, error: 'Unauthorized' })
  }
}

/* ================= Role helpers ================= */
async function getUserRoleById(id: bigint): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id },
    select: { role: true },
  })
  return u?.role ?? null
}

async function requireAdmin(req: Request & { user?: JwtUser }, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ ok: false, error: 'Unauthorized' })
  try {
    const role = await getUserRoleById(BigInt(req.user.uid))
    if ((role || '').toUpperCase() !== 'ADMIN') return res.status(403).json({ ok: false, error: 'Forbidden' })
    next()
  } catch {
    return res.status(403).json({ ok: false, error: 'Forbidden' })
  }
}

/* ================= Health ================= */
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'auth' }))

/* ================= SMTP ================= */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT ?? 465),
  secure: String(process.env.SMTP_PORT ?? '465') === '465',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
})

async function sendTicketEmail(orderId: bigint) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { email: true } },
      tickets: { select: { seatLabel: true, price: true } },
      showtime: {
        select: {
          theater: true,
          startsAt: true,
          movie: { select: { title: true } },
        },
      },
    },
  })
  if (!order) return

  let buyerEmail: string | null = null
  let discountAmt = 0
  let promoCode: string | null = null
  try {
    const extra = await prisma.order.findUnique({
      where: { id: orderId },
      select: { buyerEmail: true, discountAmt: true, promoCode: true },
    })
    buyerEmail = extra?.buyerEmail ?? null
    discountAmt = Number(extra?.discountAmt ?? 0)
    promoCode = extra?.promoCode ?? null
  } catch {
  }

  const recipient = buyerEmail ?? order.user?.email ?? null
  if (!recipient) {
    console.warn(`[mail] skip: no recipient for order ${order.refCode}`)
    return
  }

  const movieTitle = order.showtime.movie.title
  const theater = order.showtime.theater
  const startsAt = order.showtime.startsAt
  const seats = order.tickets.map(t => t.seatLabel).join(', ')
  const total = Number(order.totalAmount).toFixed(2)
  const qrPng = await QRCode.toBuffer(`TICKET:${order.refCode}`)

  const discountRow =
    discountAmt > 0
      ? `<tr><td><b>ส่วนลด</b></td><td>-${discountAmt.toFixed(2)} THB${promoCode ? ` (โค้ด: ${promoCode})` : ''}</td></tr>`
      : ''

  const html = `
  <div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial;">
    <h2>🎟️ Movie Ticket Confirmation</h2>
    <p>ออเดอร์ของคุณ <b>${order.refCode}</b> ชำระเงินเสร็จสิ้นแล้ว</p>
    <table cellpadding="6" style="border-collapse:collapse">
      <tr><td><b>เรื่อง</b></td><td>${movieTitle}</td></tr>
      <tr><td><b>โรง</b></td><td>${theater}</td></tr>
      <tr><td><b>รอบฉาย</b></td><td>${new Date(startsAt).toLocaleString()}</td></tr>
      <tr><td><b>ที่นั่ง</b></td><td>${seats}</td></tr>
      ${discountRow}
      <tr><td><b>ยอดสุทธิ</b></td><td>${total} THB</td></tr>
    </table>
    <p style="margin-top:12px">แสดง QR Code นี้ที่หน้าเคาน์เตอร์เพื่อรับตั๋ว:</p>
    <img src="cid:ticketqr" width="180" height="180" alt="Ticket QR" />
  </div>
  `

  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: recipient,
    subject: `Your Tickets: ${movieTitle} — ${order.refCode}`,
    html,
    attachments: [{ filename: 'ticket-qr.png', content: qrPng, cid: 'ticketqr' }],
  })

  console.log(`[mail] sent to ${recipient} for ${order.refCode}`)
}

/* ================= Showtime ensure ================= */
app.post('/api/showtimes/ensure', async (req, res) => {
  try {
    const { title, startsAt, theater = 'Theater 1', basePrice = 120, durationMin } = req.body as any
    if (!title) return res.status(400).json({ ok: false, error: 'Missing title' })
    if (!startsAt) return res.status(400).json({ ok: false, error: 'Missing startsAt' })

    const starts = new Date(startsAt)
    if (Number.isNaN(starts.getTime())) return res.status(400).json({ ok: false, error: `Invalid startsAt: ${startsAt}` })

    const dur = Number(durationMin ?? 120)
    if (!Number.isFinite(dur) || dur <= 0) return res.status(400).json({ ok: false, error: 'durationMin is invalid' })

    let movie = await prisma.movie.findFirst({ where: { title } })
    if (!movie) movie = await prisma.movie.create({ data: { title, durationMin: dur } })

    let show = await prisma.showtime.findFirst({ where: { movieId: movie.id, startsAt: starts } })
    if (!show) show = await prisma.showtime.create({ data: { movieId: movie.id, theater, startsAt: starts, basePrice: Number(basePrice ?? 120) } })

    return res.json({ ok: true, showtimeId: Number(show.id) })
  } catch (e: any) { console.error(e); return res.status(500).json({ ok: false, error: e.message }) }
})

/* ================= Auth ================= */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body as any
    if (!email) return res.status(400).json({ ok: false, error: 'Email required' })
    if (!password) return res.status(400).json({ ok: false, error: 'Password required' })
    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists) return res.status(409).json({ ok: false, error: 'Email already in use' })

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({ data: { email, passwordHash, displayName } })

    const role = await getUserRoleById(user.id) 
    const publicUser = { id: Number(user.id), email: user.email, displayName: user.displayName ?? null, role: role ?? 'USER' }
    const token = signToken({ uid: publicUser.id, email: publicUser.email, role: publicUser.role })
    res.json({ ok: true, token, user: publicUser })
  } catch (e: any) { console.error(e); res.status(500).json({ ok: false, error: e.message }) }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body as any
    if (!email || !password) return res.status(400).json({ ok: false, error: 'Email & password required' })
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return res.status(401).json({ ok: false, error: 'Invalid credentials' })
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ ok: false, error: 'Invalid credentials' })

    const role = await getUserRoleById(user.id)
    const publicUser = { id: Number(user.id), email: user.email, displayName: user.displayName ?? null, role: role ?? 'USER' }
    const token = signToken({ uid: publicUser.id, email: publicUser.email, role: publicUser.role })
    res.json({ ok: true, token, user: publicUser })
  } catch (e: any) { console.error(e); res.status(500).json({ ok: false, error: e.message }) }
})

app.get('/api/auth/me', auth, async (req: Request & { user?: JwtUser }, res) => {
  try {
    const id = BigInt(req.user!.uid)
    const u = await prisma.user.findUnique({ where: { id } })
    if (!u) return res.status(404).json({ ok: false, error: 'User not found' })
    const role = await getUserRoleById(id)
    res.json({ ok: true, user: { id: Number(u.id), email: u.email, displayName: u.displayName, role: role ?? 'USER' } })
  } catch (e: any) {
    console.error(e); res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/users/:email/role', async (req, res) => {
  try {
    const email = String(req.params.email || '').trim()
    if (!email) return res.status(400).json({ ok: false, error: 'Missing email' })
    const u = await prisma.user.findUnique({
      where: { email },
      select: { role: true },
    })
    res.json({ ok: true, role: u?.role ?? 'USER' })
  } catch (e: any) {
    console.error(e); res.status(500).json({ ok: false, error: e.message })
  }
})

/* ================= Promotion helpers ================= */
function normalizeCode(s?: string) { return (s || '').trim().toUpperCase() }

async function computeDiscount(
  promo: { type: string; value: number; maxDiscount: number | null; minSpend: number | null },
  subtotal: number
) {
  if (promo.minSpend && subtotal < (promo.minSpend ?? 0)) return 0
  let discount = 0
  if (promo.type.toUpperCase() === 'PERCENT') discount = subtotal * (Number(promo.value) / 100)
  else if (promo.type.toUpperCase() === 'FIXED') discount = Number(promo.value)
  if (promo.maxDiscount != null) discount = Math.min(discount, Number(promo.maxDiscount))
  discount = Math.max(0, Math.min(discount, subtotal))
  return Number(discount.toFixed(2))
}

async function canUsePromotion(promoId: bigint, userId?: bigint, email?: string) {
  if (!orm.promotion) return { ok: false, error: 'Promotions not enabled' }
  const promo = await orm.promotion.findUnique({ where: { id: promoId } })
  if (!promo || !promo.active) return { ok: false, error: 'Promotion inactive' }

  const now = new Date()
  if (promo.startsAt && now < promo.startsAt) return { ok: false, error: 'Promotion not started' }
  if (promo.endsAt && now > promo.endsAt) return { ok: false, error: 'Promotion expired' }

  if (promo.usageLimit != null) {
    const used = await orm.promotionredemption.count({ where: { promotionId: promoId } })
    if (used >= promo.usageLimit) return { ok: false, error: 'Promotion usage limit reached' }
  }
  if (promo.usagePerUser != null) {
    const OR: any[] = []
    if (userId) OR.push({ userId })
    if (email) OR.push({ email })
    const usedByUser = await orm.promotionredemption.count({ where: { promotionId: promoId, OR: OR.length ? OR : undefined } })
    if (usedByUser >= promo.usagePerUser) return { ok: false, error: 'You already used this code' }
  }
  return { ok: true }
}

/* ================= Admin Promotion APIs ================= */
app.get('/api/admin/promotions', auth, requireAdmin, async (req, res) => {
  if (!orm.promotion) return res.json({ ok: false, error: 'Promotions not enabled' })
  try {
    const status = String(req.query.status || 'ACTIVE').toUpperCase()
    const where: any = {}
    if (status === 'ACTIVE') where.active = true
    else if (status === 'DISABLED') where.active = false

    const list = await orm.promotion.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    })

    if (!orm.promotionredemption) {
      return res.json({
        ok: true,
        promotions: list.map((p: any) => ({ ...p, usageCount: 0, uniqueUsers: 0 })),
      })
    }

    const withStats = []
    for (const p of list) {
      const usageCount = await orm.promotionredemption.count({
        where: { promotionId: p.id },
      })
      const redemptions = await orm.promotionredemption.findMany({
        where: { promotionId: p.id },
        select: { userId: true, email: true },
      })
      const uniq = new Set<string>()
      for (const r of redemptions) {
        if (r.userId != null) uniq.add(`uid:${String(r.userId)}`)
        else if (r.email) uniq.add(`email:${r.email.toLowerCase()}`)
      }
      const uniqueUsers = uniq.size
      withStats.push({ ...p, usageCount, uniqueUsers })
    }

    res.json({ ok: true, promotions: withStats })
  } catch (e: any) {
    console.error(e)
    res.status(500).json({ ok: false, error: e.message })
  }
})



app.post('/api/admin/promotions', auth, requireAdmin, async (req, res) => {
  if (!orm.promotion) return res.json({ ok: false, error: 'Promotions not enabled' })
  try {
    const {
      code, type, value,
      maxDiscount = null, minSpend = null,
      startsAt = null, endsAt = null,
      usageLimit = null, usagePerUser = null,
      active = true,
    } = req.body as any

    if (!code || !type || value == null) return res.status(400).json({ ok: false, error: 'Missing fields' })
    const created = await orm.promotion.create({
      data: {
        code: normalizeCode(code),
        type: String(type).toUpperCase(),
        value: Number(value),
        maxDiscount: maxDiscount != null ? Number(maxDiscount) : null,
        minSpend: minSpend != null ? Number(minSpend) : null,
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
        usageLimit: usageLimit != null ? Number(usageLimit) : null,
        usagePerUser: usagePerUser != null ? Number(usagePerUser) : null,
        active: Boolean(active),
      }
    })
    res.json({ ok: true, promotion: created })
  } catch (e: any) { console.error(e); res.status(500).json({ ok: false, error: e.message }) }
})

app.patch('/api/admin/promotions/:id', auth, requireAdmin, async (req, res) => {
  if (!orm.promotion) return res.json({ ok: false, error: 'Promotions not enabled' })
  try {
    const id = Number(req.params.id)
    const data: any = { ...req.body }
    if (data.code) data.code = normalizeCode(data.code)
    if (data.startsAt) data.startsAt = new Date(data.startsAt)
    if (data.endsAt) data.endsAt = new Date(data.endsAt)
    const updated = await orm.promotion.update({ where: { id: BigInt(id) }, data })
    res.json({ ok: true, promotion: updated })
  } catch (e: any) { console.error(e); res.status(500).json({ ok: false, error: e.message }) }
})

app.delete('/api/admin/promotions/:id', auth, requireAdmin, async (req, res) => {
  if (!orm.promotion) return res.json({ ok: false, error: 'Promotions not enabled' })
  try {
    const id = Number(req.params.id)
    await orm.promotion.update({ where: { id: BigInt(id) }, data: { active: false } })
    res.json({ ok: true })
  } catch (e: any) { console.error(e); res.status(500).json({ ok: false, error: e.message }) }
})

/* ================= Preview discount ================= */
app.get('/api/promotions/preview', async (req, res) => {
  if (!orm.promotion) return res.json({ ok: false, error: 'Promotions not enabled' })
  try {
    const code = normalizeCode(String(req.query.code || ''))
    const amount = Number(req.query.amount || 0)
    if (!code) return res.status(400).json({ ok: false, error: 'Missing code' })
    const promo = await orm.promotion.findUnique({ where: { code } })
    if (!promo) return res.status(404).json({ ok: false, error: 'Code not found' })
    const can = await canUsePromotion(promo.id, undefined, String(req.query.email || ''))
    if (!can.ok) return res.status(400).json(can)
    const discount = await computeDiscount(promo, amount)
    res.json({ ok: true, discount, final: Math.max(0, amount - discount) })
  } catch (e: any) { console.error(e); res.status(500).json({ ok: false, error: e.message }) }
})

/* ================= Confirm Payment  ================= */
app.post('/api/payments/confirm', async (req, res) => {
  try {
    const { refCode, email, showtimeId, seats, pricePerSeat, promoCode } = req.body as {
      refCode?: string; email?: string; showtimeId?: number | string; seats?: string[];
      pricePerSeat?: number | string; promoCode?: string
    }

    if (!refCode) return res.status(400).json({ ok: false, error: 'Missing refCode' })
    const showtimeNum = Number(showtimeId)
    if (!Number.isFinite(showtimeNum)) return res.status(400).json({ ok: false, error: 'Missing/invalid showtimeId' })
    if (!Array.isArray(seats) || seats.length === 0) return res.status(400).json({ ok: false, error: 'Seats array is empty' })
    const pps = Number(pricePerSeat)
    if (!Number.isFinite(pps) || pps <= 0) return res.status(400).json({ ok: false, error: 'pricePerSeat is invalid' })

    const showtime = await prisma.showtime.findUnique({ where: { id: BigInt(showtimeNum) }, select: { id: true } })
    if (!showtime) return res.status(400).json({ ok: false, error: `Showtime not found (id: ${showtimeNum})` })

    let userId: bigint | undefined
    if (email) {
      const u = await prisma.user.findUnique({ where: { email } })
      if (u) userId = u.id
    }

    let order = await prisma.order.findUnique({ where: { refCode } })
    let emailSent = false

    if (!order) {
      const subtotal = seats.length * pps

      // ตรวจโปร
      let discount = 0
      let promoObj: any = null
      const code = normalizeCode(promoCode)
      if (code && orm.promotion) {
        promoObj = await orm.promotion.findUnique({ where: { code } })
        if (!promoObj) return res.status(400).json({ ok: false, error: 'Invalid promotion code' })
        const can = await canUsePromotion(promoObj.id, userId, email)
        if (!can.ok) return res.status(400).json(can)
        discount = await computeDiscount(promoObj, subtotal)
      }

      const finalTotal = Math.max(0, subtotal - discount)

      const baseData: any = {
        refCode,
        showtimeId: BigInt(showtimeNum),
        status: 'paid',
        totalAmount: finalTotal,
        paidAt: new Date(),
      }
      if (userId) baseData.userId = userId
      if (email) baseData.buyerEmail = email

      const dataWithPromo: any = { ...baseData }
      if (promoObj) {
        dataWithPromo.discountAmt = discount
        dataWithPromo.promoCode = code
      }

      try {
        order = await prisma.order.create({ data: promoObj ? dataWithPromo : baseData })
      } catch {
        order = await prisma.order.create({ data: baseData })
      }

      await prisma.ticket.createMany({
        data: seats.map(seat => ({ orderId: order!.id, seatLabel: seat, price: pps })),
      })

      const seatLockModel = orm.seatlock ?? orm.seatLock
      if (seatLockModel) {
        await seatLockModel.deleteMany({
          where: { showtimeId: BigInt(showtimeNum), seatLabel: { in: seats } },
        })
      }

      if (promoObj && orm.promotionredemption) {
        await orm.promotionredemption.create({
          data: { promotionId: promoObj.id, userId: userId ?? null, orderId: order.id, email: email ?? null }
        })
      }

      try { await sendTicketEmail(order.id); emailSent = true } catch (e) { console.error('[mail] failed', e) }
    }

    return res.json({ ok: true, orderId: Number(order.id), emailSent })
  } catch (e: any) {
    console.error('[confirm] error:', e)
    return res.status(500).json({ ok: false, error: e.message })
  }
})

/* ================= My Tickets ================= */
app.get('/api/users/:email/tickets', async (req, res) => {
  try {
    const email = req.params.email?.trim()
    if (!email) return res.status(400).json({ ok: false, error: 'Missing email' })

    const orders = await prisma.order.findMany({
      where: { OR: [{ buyerEmail: email }, { user: { email } }] },
      include: { tickets: true, showtime: { include: { movie: true } } },
      orderBy: { createdAt: 'desc' }
    })

    const data = orders.map(o => ({
      orderId: Number(o.id),
      refCode: o.refCode,
      status: o.status,
      totalAmount: o.totalAmount,
      createdAt: o.createdAt,
      paidAt: o.paidAt ?? null,
      buyerEmail: (o as any).buyerEmail ?? null,
      showtime: o.showtime ? {
        id: Number(o.showtime.id),
        theater: o.showtime.theater,
        startsAt: o.showtime.startsAt,
        basePrice: Number(o.showtime.basePrice),
        movie: o.showtime.movie ? {
          id: Number(o.showtime.movie.id),
          title: o.showtime.movie.title,
          durationMin: o.showtime.movie.durationMin,
          rating: (o.showtime.movie as any).rating ?? null,
        } : null
      } : null,
      tickets: o.tickets.map(t => ({ id: Number(t.id), seatLabel: t.seatLabel, price: t.price, createdAt: t.createdAt }))
    }))

    res.json({ ok: true, orders: data })
  } catch (e: any) { console.error(e); res.status(500).json({ ok: false, error: e.message }) }
})

/* ========== Apply promotion (POST) ========== */
app.post('/api/promotions/apply', async (req, res) => {
  if (!(prisma as any).promotion) {
    return res.status(404).json({ ok: false, error: 'Promotions not enabled' })
  }

  try {
    const { code, seatCount, basePrice, email } = req.body as {
      code?: string
      seatCount?: number
      basePrice?: number
      email?: string
    }

    const norm = (s?: string) => (s || '').trim().toUpperCase()
    const c = norm(code)
    if (!c) return res.status(400).json({ ok: false, error: 'Missing code' })

    const promo = await (prisma as any).promotion.findUnique({ where: { code: c } })
    if (!promo) return res.status(404).json({ ok: false, error: 'Code not found' })

    const can = await (async () => {
      const now = new Date()
      if (!promo.active) return { ok: false, error: 'Promotion inactive' }
      if (promo.startsAt && now < promo.startsAt) return { ok: false, error: 'Promotion not started' }
      if (promo.endsAt && now > promo.endsAt) return { ok: false, error: 'Promotion expired' }

      if (promo.usageLimit != null) {
        const used = await (prisma as any).promotionredemption.count({ where: { promotionId: promo.id } })
        if (used >= promo.usageLimit) return { ok: false, error: 'Promotion usage limit reached' }
      }
      if (promo.usagePerUser != null && email) {
        const usedByUser = await (prisma as any).promotionredemption.count({
          where: { promotionId: promo.id, email }
        })
        if (usedByUser >= promo.usagePerUser) return { ok: false, error: 'You already used this code' }
      }
      return { ok: true }
    })()

    if (!can.ok) return res.status(400).json(can)

    const seats = Number.isFinite(Number(seatCount)) ? Number(seatCount) : 1
    const price = Number.isFinite(Number(basePrice)) ? Number(basePrice) : 0
    const subtotal = Math.max(0, seats * price)

    const discount = await (async () => {
      let d = 0
      const type = String(promo.type).toUpperCase()
      if (promo.minSpend && subtotal < Number(promo.minSpend)) return 0
      if (type === 'PERCENT') d = subtotal * (Number(promo.value) / 100)
      else if (type === 'FIXED') d = Number(promo.value)
      if (promo.maxDiscount != null) d = Math.min(d, Number(promo.maxDiscount))
      d = Math.max(0, Math.min(d, subtotal))
      return Number(d.toFixed(2))
    })()

    const finalTotal = Math.max(0, subtotal - discount)
    const label =
      String(promo.type).toUpperCase() === 'PERCENT'
        ? `${promo.value}% off`
        : `${promo.value} THB off`

    return res.json({
      ok: true,
      promo: {
        id: Number(promo.id),
        code: promo.code,
        label,
        discountAmount: discount,
        finalTotal
      }
    })
  } catch (e: any) {
    console.error('[promo apply] error:', e)
    return res.status(500).json({ ok: false, error: e.message })
  }
})


/* ================= Public Movies  ================= */
// GET /api/movies?active=true|false (default true)
app.get('/api/movies', async (req, res) => {
  try {
    const onlyActive = String(req.query.active ?? 'true') !== 'false';
    const where: any = onlyActive ? { active: true } : {};
    const list = await prisma.movie.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, title: true, durationMin: true, rating: true,
        posterUrl: true, overview: true, active: true, createdAt: true
      }
    });

app.get('/api/movies/public', async (req, res) => {
  try {
    const onlyActive = String(req.query.active ?? 'true') !== 'false';
    const where: any = onlyActive ? { active: true } : {};
    const list = await prisma.movie.findMany({
      where,
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' }
      ],
      select: {
        id: true, title: true, durationMin: true, rating: true,
        posterUrl: true, overview: true, active: true, createdAt: true
      }
    });
    res.json({ ok: true, movies: list.map(m => ({ ...m, id: Number(m.id) })) });
  } catch (e:any) { console.error(e); res.status(500).json({ ok:false, error: e.message }); }
});

    res.json({ ok: true, movies: list.map(m => ({ ...m, id: Number(m.id) })) });
  } catch (e:any) { console.error(e); res.status(500).json({ ok:false, error: e.message }); }
});

/* ================= Admin Movies  ================= */
app.get('/api/admin/movies', auth, requireAdmin, async (_req, res) => {
  try {
    const movies = await prisma.movie.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    const normalized = movies.map(m => ({ ...m, active: m.active !== false }))
    res.json({ ok: true, movies: normalized })
  } catch (e: any) {
    console.error(e)
    res.status(500).json({ ok: false, error: e.message })
  }
})

// POST /api/admin/movies
app.post('/api/admin/movies', auth, requireAdmin, async (req, res) => {
  try {
    const { title, durationMin, rating, posterUrl, overview, active } = req.body as any
    if (!title) return res.status(400).json({ ok: false, error: 'กรอกชื่อเรื่องก่อน' })
    if (!Number(durationMin)) return res.status(400).json({ ok: false, error: 'เวลาความยาวไม่ถูกต้อง' })

    const created = await prisma.movie.create({
      data: {
        title: String(title).trim(),
        durationMin: Number(durationMin),
        rating: rating ?? null,
        posterUrl: posterUrl ?? null,
        overview: overview ?? null,
        active: active === false ? false : true,
      },
    })
    res.json({ ok: true, movie: created })
  } catch (e: any) {
    console.error(e)
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.patch('/api/admin/movies/:id', auth, requireAdmin, async (req, res) => {
  try {
    const id = BigInt(req.params.id)
    const data: any = { ...req.body }
    if (data.title != null) data.title = String(data.title).trim()
    if (data.durationMin != null) data.durationMin = Number(data.durationMin)
    if (data.rating === '') data.rating = null
    if (data.posterUrl === '') data.posterUrl = null
    if (data.overview === '') data.overview = null
    if (data.active == null) {
      delete data.active
    } else {
      data.active = !!data.active
    }

    const updated = await prisma.movie.update({ where: { id }, data })
    res.json({ ok: true, movie: updated })
  } catch (e: any) {
    console.error(e)
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/admin/movies/:id/toggle', auth, requireAdmin, async (req,res)=>{
  try {
    const id = BigInt(req.params.id)
    const m = await prisma.movie.findUnique({ where:{ id }, select:{ active:true }})
    if (!m) return res.status(404).json({ ok:false, error:'Not found' })
    const updated = await prisma.movie.update({
      where:{ id }, data:{ active: !m.active }
    })
    return res.json({ ok:true, movie: updated })
  } catch (e:any) {
    console.error('[admin/movies] toggle error:', e)
    return res.status(500).json({ ok:false, error:e.message })
  }
})

app.delete('/api/admin/movies/:id', auth, requireAdmin, async (req, res) => {
  try {
    const id = BigInt(req.params.id)
    await prisma.movie.update({ where: { id }, data: { active: false } })
    res.json({ ok: true })
  } catch (e: any) {
    console.error(e)
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/movies', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const take = Math.max(1, Math.min(100, Number(req.query.limit || 50)))

    const where: any = { active: true }
    if (q) {
      where.OR = [
        { title:  { contains: q, mode: 'insensitive' } },
        { rating: { contains: q, mode: 'insensitive' } },
      ]
    }

    const movies = await prisma.movie.findMany({
      where,
      take,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true, title: true, durationMin: true, rating: true,
        posterUrl: true, overview: true, active: true, createdAt: true,
      },
    })

    const normalized = movies.map(m => ({ ...m, active: m.active !== false }))
    res.json({ ok: true, movies: normalized })
  } catch (e: any) {
    console.error(e)
    res.status(500).json({ ok: false, error: e.message })
  }
})



/* ================= Start ================= */
app.listen(3001, () => console.log('Auth API on http://localhost:3001'))
process.on('SIGINT', async () => { await prisma.$disconnect(); process.exit(0) })
process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0) })
