BEGIN;

INSERT INTO pharmacy (code, name, city, address, latitude, longitude, is_active)
VALUES ('DEMO-01', 'Демо-аптека 1', 'Львів', 'Демонстраційна адреса 1', 49.8400, 24.0300, false),
       ('DEMO-02', 'Демо-аптека 2', 'Львів', 'Демонстраційна адреса 2', 49.8500, 24.0500, false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO drug (sku, name, dosage_form, strength, unit)
VALUES ('DEMO-PAR-500', 'Парацетамол', 'таблетки', '500 мг', 'упаковка')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO stock_item (pharmacy_id, drug_id, quantity, msl, max_level)
SELECT p.pharmacy_id, d.drug_id, demo.quantity, 10, 50
FROM (VALUES ('DEMO-01', 5), ('DEMO-02', 100)) AS demo(code, quantity)
JOIN pharmacy p ON p.code = demo.code
JOIN drug d ON d.sku = 'DEMO-PAR-500'
ON CONFLICT (pharmacy_id, drug_id) DO NOTHING;

COMMIT;
