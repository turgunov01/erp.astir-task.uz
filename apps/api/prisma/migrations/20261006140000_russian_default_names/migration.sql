-- Default names were seeded in English; the interface is Russian-only.
-- Rename only the exact default names, so anything a studio typed itself stays
-- untouched, and never onto a name that is already taken.

-- Pipeline stages of existing projects.
UPDATE "project_stages" AS s
SET "name" = m.ru
FROM (VALUES
  ('Brief', 'Бриф'),
  ('Script', 'Сценарий'),
  ('Storyboard', 'Раскадровка'),
  ('Animatic', 'Аниматик'),
  ('Concept Art', 'Концепт-арт'),
  ('Character Design', 'Дизайн персонажей'),
  ('Environment Design', 'Дизайн окружения'),
  ('Modeling', 'Моделинг'),
  ('Rigging', 'Риггинг'),
  ('Layout', 'Лейаут'),
  ('Animation', 'Анимация'),
  ('Simulation / FX', 'Симуляции и FX'),
  ('Lighting', 'Свет'),
  ('Rendering', 'Рендер'),
  ('Compositing', 'Композитинг'),
  ('Sound', 'Звук'),
  ('Editing', 'Монтаж'),
  ('Internal Review', 'Внутренний просмотр'),
  ('Client Review', 'Просмотр клиентом'),
  ('Corrections', 'Правки'),
  ('Final Render', 'Финальный рендер'),
  ('Delivery', 'Сдача')
) AS m(en, ru)
WHERE s."name" = m.en;

-- Departments (unique by name).
UPDATE "departments" AS d
SET "name" = m.ru
FROM (VALUES
  ('Production', 'Продакшн'),
  ('Animation', 'Анимация'),
  ('Modeling', 'Моделинг'),
  ('Rigging', 'Риггинг'),
  ('Lighting', 'Свет'),
  ('Rendering', 'Рендер'),
  ('Compositing', 'Композитинг'),
  ('Sound', 'Звук'),
  ('Editing', 'Монтаж'),
  ('Management', 'Руководство'),
  ('Finance', 'Финансы')
) AS m(en, ru)
WHERE d."name" = m.en
  AND NOT EXISTS (SELECT 1 FROM "departments" AS taken WHERE taken."name" = m.ru);

-- Stage lists inside pipeline templates, order preserved.
UPDATE "pipeline_templates" AS t
SET "stages" = ARRAY(
  SELECT COALESCE(m.ru, u.stage)
  FROM unnest(t."stages") WITH ORDINALITY AS u(stage, position)
  LEFT JOIN (VALUES
  ('Brief', 'Бриф'),
  ('Script', 'Сценарий'),
  ('Storyboard', 'Раскадровка'),
  ('Animatic', 'Аниматик'),
  ('Concept Art', 'Концепт-арт'),
  ('Character Design', 'Дизайн персонажей'),
  ('Environment Design', 'Дизайн окружения'),
  ('Modeling', 'Моделинг'),
  ('Rigging', 'Риггинг'),
  ('Layout', 'Лейаут'),
  ('Animation', 'Анимация'),
  ('Simulation / FX', 'Симуляции и FX'),
  ('Lighting', 'Свет'),
  ('Rendering', 'Рендер'),
  ('Compositing', 'Композитинг'),
  ('Sound', 'Звук'),
  ('Editing', 'Монтаж'),
  ('Internal Review', 'Внутренний просмотр'),
  ('Client Review', 'Просмотр клиентом'),
  ('Corrections', 'Правки'),
  ('Final Render', 'Финальный рендер'),
  ('Delivery', 'Сдача')
  ) AS m(en, ru) ON m.en = u.stage
  ORDER BY u.position
);

-- Template names (unique) and the descriptions that quote them.
UPDATE "pipeline_templates" AS t
SET "name" = m.ru,
    "description" = replace(t."description", m.en, m.ru)
FROM (VALUES
  ('2D Animation', '2D-анимация'),
  ('3D Animation', '3D-анимация'),
  ('Commercial', 'Рекламный ролик'),
  ('Motion Design', 'Моушн-дизайн'),
  ('Series Episode', 'Серия сериала')
) AS m(en, ru)
WHERE t."name" = m.en
  AND NOT EXISTS (SELECT 1 FROM "pipeline_templates" AS taken WHERE taken."name" = m.ru);
