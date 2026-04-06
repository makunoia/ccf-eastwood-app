import "dotenv/config"
import { PrismaClient } from "../app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"

const REQUIRED_ENV = ["DATABASE_URL"] as const
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key])
if (missingEnv.length > 0) {
  console.error(`Missing required environment variables: ${missingEnv.join(", ")}`)
  process.exit(1)
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  // ─── Guard: skip if already seeded ───────────────────────────────────────
  const existingLifeStages = await db.lifeStage.count()
  if (existingLifeStages > 0) {
    console.log("Database already seeded. Skipping.")
    return
  }

  // ─── Life Stages ─────────────────────────────────────────────────────────
  const [family, youth, youngAdults, seniors] = await Promise.all([
    db.lifeStage.create({ data: { name: "Family", order: 1 } }),
    db.lifeStage.create({ data: { name: "Youth", order: 2 } }),
    db.lifeStage.create({ data: { name: "Young Adults", order: 3 } }),
    db.lifeStage.create({ data: { name: "Seniors", order: 4 } }),
  ])
  console.log("✓ Created 4 life stages")

  // ─── Small Group Statuses ─────────────────────────────────────────────────
  await Promise.all([
    db.smallGroupStatus.create({ data: { name: "New", order: 1 } }),
    db.smallGroupStatus.create({ data: { name: "Regular", order: 2 } }),
    db.smallGroupStatus.create({ data: { name: "Timothy", order: 3 } }),
    db.smallGroupStatus.create({ data: { name: "Leader", order: 4 } }),
  ])
  console.log("✓ Created 4 small group statuses")

  // ─── Admin User ───────────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash("admin123", 12)
  await db.user.create({
    data: {
      name: "Super Admin",
      email: "admin@churchie.app",
      password: hashedPassword,
    },
  })
  console.log("✓ Created admin user (admin@churchie.app / admin123)")

  // ─── Members ─────────────────────────────────────────────────────────────
  const [
    james,
    maria,
    daniel,
    grace,
    elijah,
    ruth,
    joshua,
    hannah,
    samuel,
    esther,
    nathan,
    lydia,
    aaron,
    miriam,
    caleb,
  ] = await Promise.all([
    db.member.create({
      data: {
        firstName: "James",
        lastName: "Reyes",
        email: "james.reyes@email.com",
        phone: "+63 917 123 4567",
        address: "12 Mapagmahal St, Quezon City",
        dateJoined: new Date("2020-03-15"),
        lifeStageId: family.id,
        gender: "Male",
        language: "Filipino",
        birthDate: new Date("1985-06-20"),
        workCity: "Quezon City",
        workIndustry: "Education",
        meetingPreference: "InPerson",
      },
    }),
    db.member.create({
      data: {
        firstName: "Maria",
        lastName: "Santos",
        email: "maria.santos@email.com",
        phone: "+63 918 234 5678",
        address: "45 Ligaya Ave, Makati City",
        dateJoined: new Date("2019-07-01"),
        lifeStageId: youngAdults.id,
        gender: "Female",
        language: "English",
        birthDate: new Date("1996-11-03"),
        workCity: "Makati City",
        workIndustry: "Finance",
        meetingPreference: "Hybrid",
      },
    }),
    db.member.create({
      data: {
        firstName: "Daniel",
        lastName: "Cruz",
        email: "daniel.cruz@email.com",
        phone: "+63 919 345 6789",
        dateJoined: new Date("2021-01-10"),
        lifeStageId: youth.id,
        gender: "Male",
        language: "Filipino",
        birthDate: new Date("2005-04-18"),
        workCity: "Pasig City",
        workIndustry: "Student",
        meetingPreference: "Online",
      },
    }),
    db.member.create({
      data: {
        firstName: "Grace",
        lastName: "Dela Cruz",
        email: "grace.delacruz@email.com",
        phone: "+63 920 456 7890",
        address: "89 Pag-asa Rd, Pasig City",
        dateJoined: new Date("2018-05-22"),
        lifeStageId: family.id,
        gender: "Female",
        language: "Filipino",
        birthDate: new Date("1980-09-12"),
        workCity: "Pasig City",
        workIndustry: "Healthcare",
        meetingPreference: "InPerson",
      },
    }),
    db.member.create({
      data: {
        firstName: "Elijah",
        lastName: "Bautista",
        email: "elijah.bautista@email.com",
        dateJoined: new Date("2022-03-05"),
        lifeStageId: youngAdults.id,
        gender: "Male",
        language: "English",
        birthDate: new Date("1999-02-28"),
        workCity: "Taguig City",
        workIndustry: "Technology",
        meetingPreference: "Online",
      },
    }),
    db.member.create({
      data: {
        firstName: "Ruth",
        lastName: "Gonzales",
        email: "ruth.gonzales@email.com",
        phone: "+63 921 567 8901",
        address: "33 Pagmamahal St, Mandaluyong",
        dateJoined: new Date("2017-11-14"),
        lifeStageId: seniors.id,
        gender: "Female",
        language: "Filipino",
        birthDate: new Date("1958-07-07"),
        workCity: "Mandaluyong",
        workIndustry: "Retired",
        meetingPreference: "InPerson",
      },
    }),
    db.member.create({
      data: {
        firstName: "Joshua",
        lastName: "Mendoza",
        email: "joshua.mendoza@email.com",
        phone: "+63 922 678 9012",
        dateJoined: new Date("2023-06-18"),
        lifeStageId: youth.id,
        gender: "Male",
        language: "Filipino",
        birthDate: new Date("2007-12-25"),
        workCity: "Quezon City",
        workIndustry: "Student",
        meetingPreference: "InPerson",
      },
    }),
    db.member.create({
      data: {
        firstName: "Hannah",
        lastName: "Torres",
        email: "hannah.torres@email.com",
        phone: "+63 923 789 0123",
        address: "67 Masaya Lane, Parañaque City",
        dateJoined: new Date("2020-09-30"),
        lifeStageId: youngAdults.id,
        gender: "Female",
        language: "English",
        birthDate: new Date("1993-05-15"),
        workCity: "Parañaque City",
        workIndustry: "Marketing",
        meetingPreference: "Hybrid",
      },
    }),
    db.member.create({
      data: {
        firstName: "Samuel",
        lastName: "Garcia",
        email: "samuel.garcia@email.com",
        phone: "+63 924 890 1234",
        address: "21 Pananampalataya St, Caloocan City",
        dateJoined: new Date("2016-02-08"),
        lifeStageId: family.id,
        gender: "Male",
        language: "Filipino",
        birthDate: new Date("1977-03-30"),
        workCity: "Caloocan City",
        workIndustry: "Construction",
        meetingPreference: "InPerson",
      },
    }),
    db.member.create({
      data: {
        firstName: "Esther",
        lastName: "Villanueva",
        email: "esther.villanueva@email.com",
        dateJoined: new Date("2022-11-01"),
        lifeStageId: seniors.id,
        gender: "Female",
        language: "Filipino",
        birthDate: new Date("1952-01-19"),
        workCity: "Las Piñas City",
        workIndustry: "Retired",
        meetingPreference: "InPerson",
      },
    }),
    db.member.create({
      data: {
        firstName: "Nathan",
        lastName: "Aquino",
        email: "nathan.aquino@email.com",
        phone: "+63 925 901 2345",
        dateJoined: new Date("2021-08-14"),
        lifeStageId: youngAdults.id,
        gender: "Male",
        language: "English",
        birthDate: new Date("2001-08-14"),
        workCity: "Taguig City",
        workIndustry: "Technology",
        meetingPreference: "Online",
      },
    }),
    db.member.create({
      data: {
        firstName: "Lydia",
        lastName: "Ramos",
        email: "lydia.ramos@email.com",
        phone: "+63 926 012 3456",
        address: "54 Pag-ibig Blvd, Malabon",
        dateJoined: new Date("2019-04-20"),
        lifeStageId: family.id,
        gender: "Female",
        language: "Filipino",
        birthDate: new Date("1983-10-08"),
        workCity: "Malabon",
        workIndustry: "Business",
        meetingPreference: "Hybrid",
      },
    }),
    db.member.create({
      data: {
        firstName: "Aaron",
        lastName: "Castillo",
        email: "aaron.castillo@email.com",
        phone: "+63 927 123 4567",
        dateJoined: new Date("2023-01-22"),
        lifeStageId: youth.id,
        gender: "Male",
        language: "Filipino",
        birthDate: new Date("2006-06-14"),
        workCity: "Valenzuela City",
        workIndustry: "Student",
        meetingPreference: "InPerson",
      },
    }),
    db.member.create({
      data: {
        firstName: "Miriam",
        lastName: "Navarro",
        email: "miriam.navarro@email.com",
        phone: "+63 928 234 5678",
        address: "78 Puno ng Buhay St, San Juan City",
        dateJoined: new Date("2015-10-03"),
        lifeStageId: seniors.id,
        gender: "Female",
        language: "English",
        birthDate: new Date("1960-04-22"),
        workCity: "San Juan City",
        workIndustry: "Retired",
        meetingPreference: "InPerson",
      },
    }),
    db.member.create({
      data: {
        firstName: "Caleb",
        lastName: "Lim",
        email: "caleb.lim@email.com",
        phone: "+63 929 345 6789",
        dateJoined: new Date("2024-02-10"),
        lifeStageId: youngAdults.id,
        gender: "Male",
        language: "English",
        birthDate: new Date("1998-09-05"),
        workCity: "Makati City",
        workIndustry: "Media",
        meetingPreference: "Hybrid",
      },
    }),
  ])
  console.log("✓ Created 15 members")

  // ─── Schedule Preferences ─────────────────────────────────────────────────
  await db.schedulePreference.createMany({
    data: [
      { memberId: james.id, dayOfWeek: 6, timeStart: "09:00", timeEnd: "11:00" },
      { memberId: james.id, dayOfWeek: 3, timeStart: "19:00", timeEnd: "21:00" },
      { memberId: maria.id, dayOfWeek: 6, timeStart: "14:00", timeEnd: "16:00" },
      { memberId: maria.id, dayOfWeek: 2, timeStart: "19:00", timeEnd: "21:00" },
      { memberId: daniel.id, dayOfWeek: 0, timeStart: "15:00", timeEnd: "17:00" },
      { memberId: samuel.id, dayOfWeek: 6, timeStart: "09:00", timeEnd: "11:00" },
      { memberId: ruth.id, dayOfWeek: 0, timeStart: "10:00", timeEnd: "12:00" },
      { memberId: elijah.id, dayOfWeek: 5, timeStart: "20:00", timeEnd: "22:00" },
      { memberId: caleb.id, dayOfWeek: 6, timeStart: "14:00", timeEnd: "16:00" },
    ],
  })
  console.log("✓ Created schedule preferences")

  // ─── Small Groups ─────────────────────────────────────────────────────────
  // Top-level groups first (no parentGroupId)
  const familyAlpha = await db.smallGroup.create({
    data: {
      name: "Family Alpha",
      leaderId: james.id,
      lifeStageId: family.id,
      genderFocus: "Mixed",
      language: ["Filipino"],
      ageRangeMin: 30,
      ageRangeMax: 55,
      meetingFormat: "InPerson",
      locationCity: "Quezon City",
      memberLimit: 12,
    },
  })

  const youngAdultsConnect = await db.smallGroup.create({
    data: {
      name: "Young Adults Connect",
      leaderId: maria.id,
      lifeStageId: youngAdults.id,
      genderFocus: "Mixed",
      language: ["English"],
      ageRangeMin: 20,
      ageRangeMax: 35,
      meetingFormat: "Hybrid",
      locationCity: "Makati City",
      memberLimit: 15,
    },
  })

  const youthCrew = await db.smallGroup.create({
    data: {
      name: "Youth Crew",
      leaderId: daniel.id,
      lifeStageId: youth.id,
      genderFocus: "Mixed",
      language: ["Filipino"],
      ageRangeMin: 13,
      ageRangeMax: 24,
      meetingFormat: "InPerson",
      locationCity: "Pasig City",
      memberLimit: 10,
    },
  })

  const seniorsFellowship = await db.smallGroup.create({
    data: {
      name: "Seniors Fellowship",
      leaderId: ruth.id,
      lifeStageId: seniors.id,
      genderFocus: "Mixed",
      language: ["Filipino"],
      ageRangeMin: 55,
      ageRangeMax: 90,
      meetingFormat: "InPerson",
      locationCity: "Mandaluyong",
      memberLimit: 10,
    },
  })

  // Assign top-level leaders to groups (Samuel joins Family Alpha, Caleb joins Young Adults Connect)
  await Promise.all([
    db.member.update({ where: { id: samuel.id }, data: { smallGroupId: familyAlpha.id } }),
    db.member.update({ where: { id: caleb.id }, data: { smallGroupId: youngAdultsConnect.id } }),
  ])

  // Child groups (parentGroupId references the group their leader is a member of)
  const familyBeta = await db.smallGroup.create({
    data: {
      name: "Family Beta",
      leaderId: samuel.id,
      parentGroupId: familyAlpha.id,   // Samuel is a member of Family Alpha
      lifeStageId: family.id,
      genderFocus: "Mixed",
      language: ["Filipino"],
      ageRangeMin: 28,
      ageRangeMax: 50,
      meetingFormat: "InPerson",
      locationCity: "Caloocan City",
      memberLimit: 12,
    },
  })

  const youngProfessionals = await db.smallGroup.create({
    data: {
      name: "Young Professionals",
      leaderId: caleb.id,
      parentGroupId: youngAdultsConnect.id,  // Caleb is a member of Young Adults Connect
      lifeStageId: youngAdults.id,
      genderFocus: "Mixed",
      language: ["English"],
      ageRangeMin: 22,
      ageRangeMax: 32,
      meetingFormat: "Hybrid",
      locationCity: "Makati City",
      memberLimit: 10,
    },
  })

  console.log("✓ Created 6 small groups (with 2-level hierarchy)")

  // ─── Group Meeting Schedules ──────────────────────────────────────────────
  await db.groupMeetingSchedule.createMany({
    data: [
      { smallGroupId: familyAlpha.id, dayOfWeek: 6, timeStart: "09:00", timeEnd: "11:00" },
      { smallGroupId: familyBeta.id, dayOfWeek: 6, timeStart: "09:00", timeEnd: "11:00" },
      { smallGroupId: youngAdultsConnect.id, dayOfWeek: 6, timeStart: "14:00", timeEnd: "16:00" },
      { smallGroupId: youngAdultsConnect.id, dayOfWeek: 2, timeStart: "19:00", timeEnd: "21:00" },
      { smallGroupId: youngProfessionals.id, dayOfWeek: 5, timeStart: "19:00", timeEnd: "21:00" },
      { smallGroupId: youthCrew.id, dayOfWeek: 0, timeStart: "15:00", timeEnd: "17:00" },
      { smallGroupId: seniorsFellowship.id, dayOfWeek: 0, timeStart: "10:00", timeEnd: "12:00" },
    ],
  })
  console.log("✓ Created group meeting schedules")

  // ─── Assign Members to Small Groups ──────────────────────────────────────
  await Promise.all([
    // Family Alpha: Grace, Lydia (Samuel already assigned above)
    db.member.update({ where: { id: grace.id }, data: { smallGroupId: familyAlpha.id } }),
    db.member.update({ where: { id: lydia.id }, data: { smallGroupId: familyAlpha.id } }),
    // Family Beta: (Samuel leads — no additional members seeded)
    // Young Adults Connect: Elijah, Hannah, Nathan (Caleb already assigned above)
    db.member.update({ where: { id: elijah.id }, data: { smallGroupId: youngAdultsConnect.id } }),
    db.member.update({ where: { id: hannah.id }, data: { smallGroupId: youngAdultsConnect.id } }),
    db.member.update({ where: { id: nathan.id }, data: { smallGroupId: youngAdultsConnect.id } }),
    // Youth Crew: Joshua, Aaron
    db.member.update({ where: { id: joshua.id }, data: { smallGroupId: youthCrew.id } }),
    db.member.update({ where: { id: aaron.id }, data: { smallGroupId: youthCrew.id } }),
    // Seniors Fellowship: Esther, Miriam
    db.member.update({ where: { id: esther.id }, data: { smallGroupId: seniorsFellowship.id } }),
    db.member.update({ where: { id: miriam.id }, data: { smallGroupId: seniorsFellowship.id } }),
  ])
  console.log("✓ Assigned members to small groups")

  // ─── Ministries ───────────────────────────────────────────────────────────
  const [across, elevate, emerge, legacy] = await Promise.all([
    db.ministry.create({
      data: {
        name: "Across",
        lifeStageId: family.id,
        description: "Family Ministry for married couples and parents",
      },
    }),
    db.ministry.create({
      data: {
        name: "Elevate",
        lifeStageId: youth.id,
        description: "Youth Ministry for teens and young students",
      },
    }),
    db.ministry.create({
      data: {
        name: "Emerge",
        lifeStageId: youngAdults.id,
        description: "Young Adults Ministry for singles and young professionals",
      },
    }),
    db.ministry.create({
      data: {
        name: "Legacy",
        lifeStageId: seniors.id,
        description: "Seniors Ministry for mature members of the church",
      },
    }),
  ])
  console.log("✓ Created 4 ministries")

  // ─── Volunteer Committees & Roles ─────────────────────────────────────────

  // Across (Family Ministry)
  const acrossWorship = await db.volunteerCommittee.create({
    data: {
      name: "Worship Team",
      ministryId: across.id,
      roles: {
        create: [
          { name: "Worship Leader" },
          { name: "Vocalist" },
          { name: "Instrumentalist" },
        ],
      },
    },
    include: { roles: true },
  })

  const acrossUshering = await db.volunteerCommittee.create({
    data: {
      name: "Ushering Team",
      ministryId: across.id,
      roles: {
        create: [
          { name: "Head Usher" },
          { name: "Usher" },
        ],
      },
    },
    include: { roles: true },
  })

  // Elevate (Youth Ministry)
  const elevateWorship = await db.volunteerCommittee.create({
    data: {
      name: "Youth Worship",
      ministryId: elevate.id,
      roles: {
        create: [
          { name: "Worship Leader" },
          { name: "Vocalist" },
        ],
      },
    },
    include: { roles: true },
  })

  const elevateActivities = await db.volunteerCommittee.create({
    data: {
      name: "Games & Activities",
      ministryId: elevate.id,
      roles: {
        create: [
          { name: "Activities Coordinator" },
          { name: "Facilitator" },
        ],
      },
    },
    include: { roles: true },
  })

  // Emerge (Young Adults Ministry)
  const emergeHospitality = await db.volunteerCommittee.create({
    data: {
      name: "Hospitality",
      ministryId: emerge.id,
      roles: {
        create: [
          { name: "Host" },
          { name: "Greeter" },
        ],
      },
    },
    include: { roles: true },
  })

  // Legacy (Seniors Ministry)
  const legacyPrayer = await db.volunteerCommittee.create({
    data: {
      name: "Prayer Team",
      ministryId: legacy.id,
      roles: {
        create: [
          { name: "Prayer Lead" },
          { name: "Intercessor" },
        ],
      },
    },
    include: { roles: true },
  })

  console.log("✓ Created volunteer committees and roles")

  // ─── Volunteers ───────────────────────────────────────────────────────────
  // A few confirmed volunteers per ministry
  await Promise.all([
    // Samuel — Worship Team Lead in Across
    db.volunteer.create({
      data: {
        memberId: samuel.id,
        ministryId: across.id,
        committeeId: acrossWorship.id,
        preferredRoleId: acrossWorship.roles[0].id, // Worship Leader
        assignedRoleId: acrossWorship.roles[0].id,
        status: "Confirmed",
      },
    }),
    // Lydia — Ushering Team in Across
    db.volunteer.create({
      data: {
        memberId: lydia.id,
        ministryId: across.id,
        committeeId: acrossUshering.id,
        preferredRoleId: acrossUshering.roles[0].id, // Head Usher
        assignedRoleId: acrossUshering.roles[1].id,  // assigned as Usher
        status: "Confirmed",
      },
    }),
    // Daniel — Youth Worship in Elevate
    db.volunteer.create({
      data: {
        memberId: daniel.id,
        ministryId: elevate.id,
        committeeId: elevateWorship.id,
        preferredRoleId: elevateWorship.roles[0].id,
        status: "Pending",
      },
    }),
    // Joshua — Games & Activities in Elevate
    db.volunteer.create({
      data: {
        memberId: joshua.id,
        ministryId: elevate.id,
        committeeId: elevateActivities.id,
        preferredRoleId: elevateActivities.roles[1].id, // Facilitator
        assignedRoleId: elevateActivities.roles[1].id,
        status: "Confirmed",
      },
    }),
    // Maria — Hospitality in Emerge
    db.volunteer.create({
      data: {
        memberId: maria.id,
        ministryId: emerge.id,
        committeeId: emergeHospitality.id,
        preferredRoleId: emergeHospitality.roles[0].id, // Host
        assignedRoleId: emergeHospitality.roles[0].id,
        status: "Confirmed",
      },
    }),
    // Ruth — Prayer Team in Legacy
    db.volunteer.create({
      data: {
        memberId: ruth.id,
        ministryId: legacy.id,
        committeeId: legacyPrayer.id,
        preferredRoleId: legacyPrayer.roles[0].id, // Prayer Lead
        assignedRoleId: legacyPrayer.roles[0].id,
        status: "Confirmed",
      },
    }),
  ])
  console.log("✓ Created volunteers")

  // ─── Events ───────────────────────────────────────────────────────────────
  const familyCamp = await db.event.create({
    data: {
      name: "Family Camp 2026",
      description: "Annual family camp for couples and parents to grow together in faith.",
      ministries: { create: [{ ministryId: across.id }] },
      startDate: new Date("2026-05-09"),
      endDate: new Date("2026-05-11"),
      price: 250000, // PHP 2500 in cents
      registrationStart: new Date("2026-03-01"),
      registrationEnd: new Date("2026-04-30"),
    },
  })

  const youthSummit = await db.event.create({
    data: {
      name: "Youth Summit 2026",
      description: "A powerful gathering for youth to connect, worship, and grow.",
      ministries: { create: [{ ministryId: elevate.id }] },
      startDate: new Date("2026-06-13"),
      endDate: new Date("2026-06-14"),
      registrationStart: new Date("2026-04-01"),
      registrationEnd: new Date("2026-06-01"),
    },
  })
  console.log("✓ Created 2 events")

  // ─── Event Registrants ────────────────────────────────────────────────────
  const [jamesReg, graceReg, danielReg, joshuaReg] = await Promise.all([
    // Family Camp registrants (members)
    db.eventRegistrant.create({
      data: { eventId: familyCamp.id, memberId: james.id, isPaid: true, attendedAt: null },
    }),
    db.eventRegistrant.create({
      data: { eventId: familyCamp.id, memberId: grace.id, isPaid: true, attendedAt: null },
    }),
    // Youth Summit registrants (members)
    db.eventRegistrant.create({
      data: { eventId: youthSummit.id, memberId: daniel.id, isPaid: false, attendedAt: null },
    }),
    db.eventRegistrant.create({
      data: { eventId: youthSummit.id, memberId: joshua.id, isPaid: false, attendedAt: null },
    }),
  ])

  // Non-member registrant for Youth Summit
  await db.eventRegistrant.create({
    data: {
      eventId: youthSummit.id,
      firstName: "Kevin",
      lastName: "Tan",
      nickname: "Kev",
      email: "kevin.tan@gmail.com",
      mobileNumber: "+63 930 111 2222",
      isPaid: false,
    },
  })
  console.log("✓ Created 5 event registrants (4 members + 1 non-member)")

  // ─── Event Volunteer Committees & Breakout Groups ─────────────────────────
  // Committees scoped to Family Camp
  const campActivities = await db.volunteerCommittee.create({
    data: {
      name: "Camp Activities",
      eventId: familyCamp.id,
      roles: {
        create: [
          { name: "Group Facilitator" },
          { name: "Camp Coordinator" },
        ],
      },
    },
    include: { roles: true },
  })
  console.log("✓ Created event volunteer committee")

  // Volunteer for the event (Samuel as camp facilitator)
  const samuelEventVol = await db.volunteer.create({
    data: {
      memberId: samuel.id,
      eventId: familyCamp.id,
      committeeId: campActivities.id,
      preferredRoleId: campActivities.roles[0].id,
      assignedRoleId: campActivities.roles[0].id,
      status: "Confirmed",
    },
  })

  // Breakout Groups for Family Camp
  const breakout1 = await db.breakoutGroup.create({
    data: {
      eventId: familyCamp.id,
      name: "Breakout A — Couples",
      facilitatorId: samuelEventVol.id,
      memberLimit: 10,
      genderFocus: "Mixed",
      language: ["Filipino"],
    },
  })

  // Assign registrants to breakout group
  await db.breakoutGroupMember.createMany({
    data: [
      { breakoutGroupId: breakout1.id, registrantId: jamesReg.id },
      { breakoutGroupId: breakout1.id, registrantId: graceReg.id },
    ],
  })
  console.log("✓ Created breakout group with member assignments")

  // ─── Matching Weight Config ───────────────────────────────────────────────
  await Promise.all([
    db.matchingWeightConfig.create({
      data: {
        context: "SmallGroup",
        lifeStage: 0.20,
        gender: 0.10,
        language: 0.15,
        age: 0.10,
        schedule: 0.15,
        location: 0.10,
        mode: 0.10,
        career: 0.05,
        capacity: 0.05,
      },
    }),
    db.matchingWeightConfig.create({
      data: {
        context: "Breakout",
        lifeStage: 0.25,
        gender: 0.20,
        language: 0.20,
        age: 0.10,
        schedule: 0.05,
        location: 0.05,
        mode: 0.05,
        career: 0.05,
        capacity: 0.05,
      },
    }),
  ])
  console.log("✓ Created matching weight configs")
}

main()
  .then(() => {
    console.log("Seed complete.")
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
