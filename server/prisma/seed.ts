import { PrismaClient, ServiceCategory, SlotStatus, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// All seed photographers live in California → the Prisma default
// (`America/Los_Angeles`) already applies. When we expand to other regions,
// add `timezone` here and pass it through in `prisma.photographerProfile.upsert`.
type SeedPhotographer = {
  email: string;
  name: string;
  bio: string;
  homeCity: string;
  homeAddress: string;
  heroImageUrl: string;
  avatarUrl: string;
  hourlyRateCents: number;
  avgRating: number;
  ratingCount: number;
  lat: number;
  lng: number;
  services: {
    title: string;
    durationMinutes: number;
    priceCents: number;
    category: ServiceCategory;
  }[];
};

const PHOTOGRAPHERS: SeedPhotographer[] = [
  {
    email: 'tim.otto@capture.test',
    name: 'Tim Otto',
    bio: 'Outdoor portrait & lifestyle photographer based in North Park.',
    homeCity: 'San Diego, CA',
    homeAddress: '2933 Adams Ave, San Diego, CA 92116',
    heroImageUrl: 'https://images.unsplash.com/photo-1554048612-b6a482bc67e5?w=1200',
    avatarUrl: 'https://i.pravatar.cc/200?img=12',
    hourlyRateCents: 12000,
    avgRating: 4.1,
    ratingCount: 13,
    lat: 32.7642,
    lng: -117.1326,
    services: [
      { title: 'Family Portraits', durationMinutes: 45, priceCents: 1800, category: 'family' },
      { title: 'Engagement Session', durationMinutes: 90, priceCents: 15000, category: 'portrait' },
    ],
  },
  {
    email: 'topshelf@capture.test',
    name: 'Top Shelf Photo',
    bio: 'Oceanside-based studio for weddings and events.',
    homeCity: 'Oceanside, CA',
    homeAddress: '302 Wisconsin Ave, Oceanside, CA 92054',
    heroImageUrl: 'https://images.unsplash.com/photo-1518621736915-f3b1c41bfd00?w=1200',
    avatarUrl: 'https://i.pravatar.cc/200?img=33',
    hourlyRateCents: 20000,
    avgRating: 4.3,
    ratingCount: 38,
    lat: 33.1959,
    lng: -117.3795,
    services: [
      { title: 'Wedding Package', durationMinutes: 480, priceCents: 250000, category: 'wedding' },
      { title: 'Wedding Highlight Video', durationMinutes: 480, priceCents: 180000, category: 'wedding_video' },
    ],
  },
  {
    email: 'vallentyne@capture.test',
    name: 'Vallentyne Photography',
    bio: 'Family, portrait, and newborn sessions. Samuel shoots most sessions.',
    homeCity: 'San Diego, CA',
    homeAddress: '1220 Rosecrans St, San Diego, CA 92106',
    heroImageUrl: 'https://images.unsplash.com/photo-1523438885200-e635ba2c371e?w=1200',
    avatarUrl: 'https://i.pravatar.cc/200?img=52',
    hourlyRateCents: 8000,
    avgRating: 4.6,
    ratingCount: 57,
    lat: 32.7416,
    lng: -117.2214,
    services: [
      { title: 'Family Portraits', durationMinutes: 45, priceCents: 1800, category: 'family' },
      { title: 'Newborn Session', durationMinutes: 60, priceCents: 22000, category: 'portrait' },
      { title: 'Headshots', durationMinutes: 30, priceCents: 12000, category: 'headshot' },
    ],
  },
  {
    email: 'true.photo@capture.test',
    name: 'True Photography',
    bio: 'Downtown studio for headshots, commercial work, and events.',
    homeCity: 'San Diego, CA',
    homeAddress: '445 E St, San Diego, CA 92101',
    heroImageUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=1200',
    avatarUrl: 'https://i.pravatar.cc/200?img=22',
    hourlyRateCents: 15000,
    avgRating: 4.7,
    ratingCount: 124,
    lat: 32.7157,
    lng: -117.1611,
    services: [
      { title: 'Corporate Headshots', durationMinutes: 30, priceCents: 15000, category: 'headshot' },
      { title: 'Event Coverage (2 hr)', durationMinutes: 120, priceCents: 40000, category: 'event' },
    ],
  },
  {
    email: 'jimmy.wu@capture.test',
    name: 'Jimmy Wu Photography',
    bio: 'Event and party photography with a documentary style.',
    homeCity: 'San Diego, CA',
    homeAddress: '4645 Convoy St, San Diego, CA 92111',
    heroImageUrl: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=1200',
    avatarUrl: 'https://i.pravatar.cc/200?img=15',
    hourlyRateCents: 14000,
    avgRating: 4.5,
    ratingCount: 46,
    lat: 32.8242,
    lng: -117.1544,
    services: [
      { title: 'Event Coverage (3 hr)', durationMinutes: 180, priceCents: 55000, category: 'event' },
      { title: 'Birthday Party', durationMinutes: 120, priceCents: 35000, category: 'event' },
    ],
  },
  {
    email: 'rz.photo@capture.test',
    name: 'RZ Photography',
    bio: 'Wedding storytelling with a natural-light approach.',
    homeCity: 'San Diego, CA',
    homeAddress: '2150 W Washington St, San Diego, CA 92110',
    heroImageUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=1200',
    avatarUrl: 'https://i.pravatar.cc/200?img=7',
    hourlyRateCents: 18000,
    avgRating: 4.8,
    ratingCount: 88,
    lat: 32.7568,
    lng: -117.1912,
    services: [
      { title: 'Wedding Package', durationMinutes: 480, priceCents: 280000, category: 'wedding' },
      { title: 'Elopement', durationMinutes: 240, priceCents: 130000, category: 'wedding' },
    ],
  },
  {
    email: 'aurora.studios@capture.test',
    name: 'Aurora Studios',
    bio: 'La Jolla-based for editorial portrait and brand shoots.',
    homeCity: 'La Jolla, CA',
    homeAddress: '7825 Fay Ave, La Jolla, CA 92037',
    heroImageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200',
    avatarUrl: 'https://i.pravatar.cc/200?img=40',
    hourlyRateCents: 25000,
    avgRating: 4.9,
    ratingCount: 29,
    lat: 32.8411,
    lng: -117.2744,
    services: [
      { title: 'Editorial Portrait', durationMinutes: 90, priceCents: 38000, category: 'portrait' },
      { title: 'Brand Content Shoot', durationMinutes: 240, priceCents: 90000, category: 'other' },
    ],
  },
  {
    email: 'coast.visuals@capture.test',
    name: 'Coast Visuals',
    bio: 'Encinitas beach and surf portrait sessions.',
    homeCity: 'Encinitas, CA',
    homeAddress: '510 N Coast Hwy 101, Encinitas, CA 92024',
    heroImageUrl: 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=1200',
    avatarUrl: 'https://i.pravatar.cc/200?img=26',
    hourlyRateCents: 11000,
    avgRating: 4.2,
    ratingCount: 17,
    lat: 33.0370,
    lng: -117.2920,
    services: [
      { title: 'Beach Portrait', durationMinutes: 60, priceCents: 14000, category: 'portrait' },
      { title: 'Couples Session', durationMinutes: 90, priceCents: 22000, category: 'portrait' },
    ],
  },
  {
    email: 'luna.film@capture.test',
    name: 'Luna Film Co.',
    bio: 'Wedding and event cinematography.',
    homeCity: 'San Diego, CA',
    homeAddress: '1050 University Ave, San Diego, CA 92103',
    heroImageUrl: 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=1200',
    avatarUrl: 'https://i.pravatar.cc/200?img=48',
    hourlyRateCents: 22000,
    avgRating: 4.6,
    ratingCount: 31,
    lat: 32.7484,
    lng: -117.1500,
    services: [
      { title: 'Wedding Film', durationMinutes: 480, priceCents: 320000, category: 'wedding_video' },
      { title: 'Event Recap Video', durationMinutes: 180, priceCents: 95000, category: 'event' },
    ],
  },
  {
    email: 'kindred.photo@capture.test',
    name: 'Kindred Photo',
    bio: 'Family and newborn photographer serving North County.',
    homeCity: 'Carlsbad, CA',
    homeAddress: '2725 Jefferson St, Carlsbad, CA 92008',
    heroImageUrl: 'https://images.unsplash.com/photo-1542037104857-ffbb0b9155fb?w=1200',
    avatarUrl: 'https://i.pravatar.cc/200?img=68',
    hourlyRateCents: 9500,
    avgRating: 4.4,
    ratingCount: 52,
    lat: 33.1581,
    lng: -117.3506,
    services: [
      { title: 'Family Portraits', durationMinutes: 45, priceCents: 1800, category: 'family' },
      { title: 'Newborn Session', durationMinutes: 90, priceCents: 25000, category: 'portrait' },
    ],
  },
];

function generateSlots(daysAhead: number) {
  const slots: { startsAt: Date; endsAt: Date }[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let day = 0; day < daysAhead; day++) {
    const date = new Date(now);
    date.setDate(date.getDate() + day);
    for (const hour of [10, 11, 12, 13, 14, 15, 16]) {
      for (const minute of [0, 30]) {
        const starts = new Date(date);
        starts.setHours(hour, minute, 0, 0);
        const ends = new Date(starts);
        ends.setMinutes(ends.getMinutes() + 30);
        slots.push({ startsAt: starts, endsAt: ends });
      }
    }
  }
  return slots;
}

async function main() {
  console.log('Seeding database...');

  const defaultPassword = await bcrypt.hash('capture123', 10);

  // Demo customer account matching the "Jad" persona on the voucher screen.
  const customer = await prisma.user.upsert({
    where: { email: 'jad@capture.test' },
    update: {},
    create: {
      email: 'jad@capture.test',
      name: 'Jad',
      role: UserRole.customer,
      passwordHash: defaultPassword,
      avatarUrl: 'https://i.pravatar.cc/200?img=60',
    },
  });

  // Demo friend who sent Jad the vouchers.
  const friend = await prisma.user.upsert({
    where: { email: 'nick@capture.test' },
    update: {},
    create: {
      email: 'nick@capture.test',
      name: 'Nick Lagerberg',
      role: UserRole.customer,
      passwordHash: defaultPassword,
      avatarUrl: 'https://i.pravatar.cc/200?img=3',
    },
  });

  // Two vouchers so the inbox screen looks like the mockup.
  const june = new Date();
  june.setMonth(june.getMonth() + 2);
  const march = new Date();
  march.setMonth(march.getMonth() + 4);

  // Seed vouchers go straight to `active`; production code path requires a
  // confirmed Stripe PaymentIntent before status flips.
  await prisma.voucher.createMany({
    data: [
      {
        senderId: friend.id,
        recipientId: customer.id,
        percentOff: 25,
        category: 'wedding_video',
        expiresAt: june,
        status: 'active',
        purchaseAmountCents: 0,
      },
      {
        senderId: friend.id,
        recipientId: customer.id,
        percentOff: 35,
        category: 'portrait',
        expiresAt: march,
        status: 'active',
        purchaseAmountCents: 0,
      },
    ],
    skipDuplicates: true,
  });

  for (const p of PHOTOGRAPHERS) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: {
        email: p.email,
        name: p.name,
        role: UserRole.photographer,
        passwordHash: defaultPassword,
        avatarUrl: p.avatarUrl,
      },
    });

    const profile = await prisma.photographerProfile.upsert({
      where: { userId: user.id },
      update: {
        bio: p.bio,
        homeCity: p.homeCity,
        homeAddress: p.homeAddress,
        heroImageUrl: p.heroImageUrl,
        hourlyRateCents: p.hourlyRateCents,
        avgRating: p.avgRating,
        ratingCount: p.ratingCount,
      },
      create: {
        userId: user.id,
        bio: p.bio,
        homeCity: p.homeCity,
        homeAddress: p.homeAddress,
        heroImageUrl: p.heroImageUrl,
        hourlyRateCents: p.hourlyRateCents,
        avgRating: p.avgRating,
        ratingCount: p.ratingCount,
      },
    });

    // Set the PostGIS geography point. Prisma doesn't model GEOGRAPHY, so we raw-update it.
    await prisma.$executeRawUnsafe(
      `UPDATE "PhotographerProfile" SET "searchLocation" = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography WHERE id = $3`,
      p.lng,
      p.lat,
      profile.id,
    );

    // Replace services wholesale so re-seeding is idempotent.
    await prisma.service.deleteMany({ where: { photographerId: profile.id } });
    await prisma.service.createMany({
      data: p.services.map((s) => ({
        photographerId: profile.id,
        title: s.title,
        durationMinutes: s.durationMinutes,
        priceCents: s.priceCents,
        category: s.category,
      })),
    });

    // Fresh slots for the next 14 days.
    await prisma.availabilitySlot.deleteMany({
      where: { photographerId: profile.id, status: SlotStatus.open },
    });
    const slots = generateSlots(14);
    await prisma.availabilitySlot.createMany({
      data: slots.map((s) => ({
        photographerId: profile.id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        status: SlotStatus.open,
      })),
    });
  }

  console.log(`Seeded ${PHOTOGRAPHERS.length} photographers, 2 vouchers, 2 customers.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
