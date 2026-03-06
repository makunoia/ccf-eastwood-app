import "dotenv/config"
import { PrismaClient } from "../app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  // ─── Life Stages ─────────────────────────────────────────────────────────

  const lifeStages = await Promise.all([
    db.lifeStage.upsert({
      where: { name: "Family" },
      update: {},
      create: { name: "Family", order: 1 },
    }),
    db.lifeStage.upsert({
      where: { name: "Youth" },
      update: {},
      create: { name: "Youth", order: 2 },
    }),
    db.lifeStage.upsert({
      where: { name: "Young Adults" },
      update: {},
      create: { name: "Young Adults", order: 3 },
    }),
    db.lifeStage.upsert({
      where: { name: "Seniors" },
      update: {},
      create: { name: "Seniors", order: 4 },
    }),
  ])

  const [family, youth, youngAdults, seniors] = lifeStages

  console.log(`✓ Created ${lifeStages.length} life stages`)

  // ─── Members ─────────────────────────────────────────────────────────────

  const members = [
    {
      firstName: "James",
      lastName: "Reyes",
      email: "james.reyes@email.com",
      phone: "+63 917 123 4567",
      address: "12 Mapagmahal St, Quezon City",
      dateJoined: new Date("2020-03-15"),
      lifeStageId: family.id,
      gender: "Male" as const,
      language: "Filipino",
      birthDate: new Date("1985-06-20"),
      workCity: "Quezon City",
      workIndustry: "Education",
      meetingPreference: "InPerson" as const,
    },
    {
      firstName: "Maria",
      lastName: "Santos",
      email: "maria.santos@email.com",
      phone: "+63 918 234 5678",
      address: "45 Ligaya Ave, Makati City",
      dateJoined: new Date("2019-07-01"),
      lifeStageId: youngAdults.id,
      gender: "Female" as const,
      language: "English",
      birthDate: new Date("1996-11-03"),
      workCity: "Makati City",
      workIndustry: "Finance",
      meetingPreference: "Hybrid" as const,
    },
    {
      firstName: "Daniel",
      lastName: "Cruz",
      email: "daniel.cruz@email.com",
      phone: "+63 919 345 6789",
      dateJoined: new Date("2021-01-10"),
      lifeStageId: youth.id,
      gender: "Male" as const,
      language: "Filipino",
      birthDate: new Date("2005-04-18"),
      workCity: "Pasig City",
      workIndustry: "Student",
      meetingPreference: "Online" as const,
    },
    {
      firstName: "Grace",
      lastName: "Dela Cruz",
      email: "grace.delacruz@email.com",
      phone: "+63 920 456 7890",
      address: "89 Pag-asa Rd, Pasig City",
      dateJoined: new Date("2018-05-22"),
      lifeStageId: family.id,
      gender: "Female" as const,
      language: "Filipino",
      birthDate: new Date("1980-09-12"),
      workCity: "Pasig City",
      workIndustry: "Healthcare",
      meetingPreference: "InPerson" as const,
    },
    {
      firstName: "Elijah",
      lastName: "Bautista",
      email: "elijah.bautista@email.com",
      dateJoined: new Date("2022-03-05"),
      lifeStageId: youngAdults.id,
      gender: "Male" as const,
      language: "English",
      birthDate: new Date("1999-02-28"),
      workCity: "Taguig City",
      workIndustry: "Technology",
      meetingPreference: "Online" as const,
    },
    {
      firstName: "Ruth",
      lastName: "Gonzales",
      email: "ruth.gonzales@email.com",
      phone: "+63 921 567 8901",
      address: "33 Pagmamahal St, Mandaluyong",
      dateJoined: new Date("2017-11-14"),
      lifeStageId: seniors.id,
      gender: "Female" as const,
      language: "Filipino",
      birthDate: new Date("1958-07-07"),
      workCity: "Mandaluyong",
      workIndustry: "Retired",
      meetingPreference: "InPerson" as const,
    },
    {
      firstName: "Joshua",
      lastName: "Mendoza",
      email: "joshua.mendoza@email.com",
      phone: "+63 922 678 9012",
      dateJoined: new Date("2023-06-18"),
      lifeStageId: youth.id,
      gender: "Male" as const,
      language: "Filipino",
      birthDate: new Date("2007-12-25"),
      workCity: "Quezon City",
      workIndustry: "Student",
      meetingPreference: "InPerson" as const,
    },
    {
      firstName: "Hannah",
      lastName: "Torres",
      email: "hannah.torres@email.com",
      phone: "+63 923 789 0123",
      address: "67 Masaya Lane, Parañaque City",
      dateJoined: new Date("2020-09-30"),
      lifeStageId: youngAdults.id,
      gender: "Female" as const,
      language: "English",
      birthDate: new Date("1993-05-15"),
      workCity: "Parañaque City",
      workIndustry: "Marketing",
      meetingPreference: "Hybrid" as const,
    },
    {
      firstName: "Samuel",
      lastName: "Garcia",
      email: "samuel.garcia@email.com",
      phone: "+63 924 890 1234",
      address: "21 Pananampalataya St, Caloocan City",
      dateJoined: new Date("2016-02-08"),
      lifeStageId: family.id,
      gender: "Male" as const,
      language: "Filipino",
      birthDate: new Date("1977-03-30"),
      workCity: "Caloocan City",
      workIndustry: "Construction",
      meetingPreference: "InPerson" as const,
    },
    {
      firstName: "Esther",
      lastName: "Villanueva",
      email: "esther.villanueva@email.com",
      dateJoined: new Date("2022-11-01"),
      lifeStageId: seniors.id,
      gender: "Female" as const,
      language: "Filipino",
      birthDate: new Date("1952-01-19"),
      workCity: "Las Piñas City",
      workIndustry: "Retired",
      meetingPreference: "InPerson" as const,
    },
    {
      firstName: "Nathan",
      lastName: "Aquino",
      email: "nathan.aquino@email.com",
      phone: "+63 925 901 2345",
      dateJoined: new Date("2021-08-14"),
      lifeStageId: youngAdults.id,
      gender: "Male" as const,
      language: "English",
      birthDate: new Date("2001-08-14"),
      workCity: "Taguig City",
      workIndustry: "Technology",
      meetingPreference: "Online" as const,
    },
    {
      firstName: "Lydia",
      lastName: "Ramos",
      email: "lydia.ramos@email.com",
      phone: "+63 926 012 3456",
      address: "54 Pag-ibig Blvd, Malabon",
      dateJoined: new Date("2019-04-20"),
      lifeStageId: family.id,
      gender: "Female" as const,
      language: "Filipino",
      birthDate: new Date("1983-10-08"),
      workCity: "Malabon",
      workIndustry: "Business",
      meetingPreference: "Hybrid" as const,
    },
    {
      firstName: "Aaron",
      lastName: "Castillo",
      email: "aaron.castillo@email.com",
      phone: "+63 927 123 4567",
      dateJoined: new Date("2023-01-22"),
      lifeStageId: youth.id,
      gender: "Male" as const,
      language: "Filipino",
      birthDate: new Date("2006-06-14"),
      workCity: "Valenzuela City",
      workIndustry: "Student",
      meetingPreference: "InPerson" as const,
    },
    {
      firstName: "Miriam",
      lastName: "Navarro",
      email: "miriam.navarro@email.com",
      phone: "+63 928 234 5678",
      address: "78 Puno ng Buhay St, San Juan City",
      dateJoined: new Date("2015-10-03"),
      lifeStageId: seniors.id,
      gender: "Female" as const,
      language: "English",
      birthDate: new Date("1960-04-22"),
      workCity: "San Juan City",
      workIndustry: "Retired",
      meetingPreference: "InPerson" as const,
    },
    {
      firstName: "Caleb",
      lastName: "Lim",
      email: "caleb.lim@email.com",
      phone: "+63 929 345 6789",
      dateJoined: new Date("2024-02-10"),
      lifeStageId: youngAdults.id,
      gender: "Male" as const,
      language: "English",
      birthDate: new Date("1998-09-05"),
      workCity: "Makati City",
      workIndustry: "Media",
      meetingPreference: "Hybrid" as const,
    },
  ]

  let created = 0
  for (const member of members) {
    await db.member.upsert({
      where: { email: member.email },
      update: {},
      create: member,
    })
    created++
  }

  console.log(`✓ Created ${created} members`)
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
