BEGIN;

INSERT INTO "role" (code, name, data_scope) VALUES
  ('admin', 'Адміністратор', 'мережа'),
  ('manager', 'Товарний менеджер', 'мережа'),
  ('head', 'Завідувач аптеки', 'призначені аптеки'),
  ('logist', 'Логіст', 'призначені аптеки');

INSERT INTO permission (code, name, requirement) VALUES
  ('USERS_MANAGE', 'Керування обліковими записами', 'FR-20'),
  ('REFERENCE_EDIT', 'Редагування довідників', 'FR-17'),
  ('THRESHOLDS_EDIT', 'Налаштування MSL/Max', 'FR-18'),
  ('AUDIT_VIEW', 'Перегляд аудиту', 'FR-16'),
  ('DATA_IMPORT', 'Імпорт даних власної аптеки', 'FR-01, FR-02'),
  ('PHARMACY_VIEW', 'Перегляд призначених аптек', 'FR-11'),
  ('NETWORK_VIEW', 'Перегляд мережі', 'FR-04, FR-09'),
  ('REC_DECIDE', 'Рішення щодо рекомендації', 'FR-10'),
  ('REC_CANCEL', 'Скасування рекомендації', 'FR-13'),
  ('STATS_VIEW', 'Перегляд і експорт статистики', 'FR-21, FR-22'),
  ('TRANSFER_VIEW', 'Перегляд переміщень', 'FR-19'),
  ('TRANSFER_DISPATCH', 'Початок переміщення', 'FR-19'),
  ('RECEIPT_CONFIRM', 'Підтвердження отримання', 'FR-12');

INSERT INTO role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM (VALUES
  ('admin', 'USERS_MANAGE'),
  ('admin', 'REFERENCE_EDIT'),
  ('admin', 'THRESHOLDS_EDIT'),
  ('manager', 'THRESHOLDS_EDIT'),
  ('admin', 'AUDIT_VIEW'),
  ('manager', 'AUDIT_VIEW'),
  ('head', 'DATA_IMPORT'),
  ('head', 'PHARMACY_VIEW'),
  ('logist', 'PHARMACY_VIEW'),
  ('manager', 'NETWORK_VIEW'),
  ('manager', 'REC_DECIDE'),
  ('manager', 'REC_CANCEL'),
  ('manager', 'STATS_VIEW'),
  ('logist', 'TRANSFER_VIEW'),
  ('logist', 'TRANSFER_DISPATCH'),
  ('head', 'RECEIPT_CONFIRM')
) AS grants(role_code, permission_code)
JOIN "role" r ON r.code = grants.role_code
JOIN permission p ON p.code = grants.permission_code;

INSERT INTO action_type (code, name, permission_id, from_status, to_status)
SELECT a.code, a.name, p.permission_id,
       a.from_status::"RecommendationStatus", a.to_status::"RecommendationStatus"
FROM (VALUES
  ('CONFIRM', 'Підтвердити', 'REC_DECIDE', 'Сформована', 'Підтверджена'),
  ('REJECT', 'Відхилити', 'REC_DECIDE', 'Сформована', 'Відхилена'),
  ('DISPATCH', 'Розпочати переміщення', 'TRANSFER_DISPATCH', 'Підтверджена', 'У виконанні'),
  ('RECEIVE', 'Підтвердити отримання', 'RECEIPT_CONFIRM', 'У виконанні', 'Виконана'),
  ('CANCEL', 'Скасувати', 'REC_CANCEL', 'Підтверджена', 'Скасована')
) AS a(code, name, permission_code, from_status, to_status)
JOIN permission p ON p.code = a.permission_code;

COMMIT;
