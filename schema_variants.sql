-- ============================================================
-- Варианты (размеры) и модификаторы (соусы/добавки). Идемпотентно.
-- Простые товары (суши) не затрагиваются: у них нет строк в этих таблицах.
-- ============================================================
CREATE TABLE IF NOT EXISTS product_variants (
                                              id         SERIAL PRIMARY KEY,
                                              product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name       VARCHAR(60) NOT NULL,
  price      NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  weight     VARCHAR(50),
  sort_order INT NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (product_id, name)
  );
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants (product_id);

CREATE TABLE IF NOT EXISTS modifier_groups (
                                             id         SERIAL PRIMARY KEY,
                                             name       VARCHAR(80) NOT NULL,
  min_select INT NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select INT NOT NULL DEFAULT 1 CHECK (max_select >= 1),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  CHECK (min_select <= max_select)
  );

CREATE TABLE IF NOT EXISTS modifiers (
                                       id         SERIAL PRIMARY KEY,
                                       group_id   INT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name       VARCHAR(80) NOT NULL,
  price      NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  sort_order INT NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (group_id, name)
  );
CREATE INDEX IF NOT EXISTS idx_modifiers_group ON modifiers (group_id);

CREATE TABLE IF NOT EXISTS product_modifier_groups (
                                                     product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  group_id   INT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, group_id)
  );

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id   INT REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_name VARCHAR(60);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS options      JSONB NOT NULL DEFAULT '[]'::jsonb;
