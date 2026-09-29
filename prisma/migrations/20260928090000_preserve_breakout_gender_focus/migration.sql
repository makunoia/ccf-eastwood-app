-- Existing breakout groups may have relied on the facilitator or linked DGroup
-- to supply an implicit gender focus. Persist that former effective value before
-- application code starts treating a blank focus as open to every gender.
UPDATE "BreakoutGroup" AS bg
SET "genderFocus" = prior.focus
FROM (
  SELECT g.id,
    CASE
      WHEN lead_member.gender IS NOT NULL
        AND co_member.gender IS NOT NULL
        AND lead_member.gender <> co_member.gender
        THEN 'Mixed'::"GenderFocus"
      WHEN lead_member.gender IS NOT NULL
        THEN lead_member.gender::text::"GenderFocus"
      WHEN co_member.gender IS NOT NULL
        THEN co_member.gender::text::"GenderFocus"
      ELSE linked_group."genderFocus"
    END AS focus
  FROM "BreakoutGroup" AS g
  LEFT JOIN "Volunteer" AS lead_volunteer ON lead_volunteer.id = g."facilitatorId"
  LEFT JOIN "Member" AS lead_member ON lead_member.id = lead_volunteer."memberId"
  LEFT JOIN "Volunteer" AS co_volunteer ON co_volunteer.id = g."coFacilitatorId"
  LEFT JOIN "Member" AS co_member ON co_member.id = co_volunteer."memberId"
  LEFT JOIN "SmallGroup" AS linked_group ON linked_group.id = g."linkedSmallGroupId"
) AS prior
WHERE bg.id = prior.id
  AND bg."genderFocus" IS NULL
  AND prior.focus IS NOT NULL;
