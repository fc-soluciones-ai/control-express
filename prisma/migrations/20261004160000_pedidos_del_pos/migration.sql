-- CreateTable
CREATE TABLE "pedidos" (
    "id" TEXT NOT NULL,
    "clave_del_pos" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "serie_folio" TEXT,
    "clave_cliente" TEXT,
    "id_direccion" TEXT,
    "telefono_usado" TEXT,
    "cliente_id" TEXT,
    "id_mesero" TEXT,
    "chofer_id" TEXT,
    "entro_en" TIMESTAMP(3) NOT NULL,
    "empaquetado_en" TIMESTAMP(3),
    "asignado_en" TIMESTAMP(3),
    "salio_en" TIMESTAMP(3),
    "llego_en" TIMESTAMP(3),
    "cerrado_en" TIMESTAMP(3),
    "es_a_domicilio" BOOLEAN NOT NULL DEFAULT false,
    "cancelado" BOOLEAN NOT NULL DEFAULT false,
    "total" INTEGER NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL,
    "sincronizado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_clave_del_pos_key" ON "pedidos"("clave_del_pos");

-- CreateIndex
CREATE INDEX "pedidos_estado_entro_en_idx" ON "pedidos"("estado", "entro_en");

-- CreateIndex
CREATE INDEX "pedidos_cliente_id_entro_en_idx" ON "pedidos"("cliente_id", "entro_en");

-- CreateIndex
CREATE INDEX "pedidos_chofer_id_entro_en_idx" ON "pedidos"("chofer_id", "entro_en");

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_chofer_id_fkey" FOREIGN KEY ("chofer_id") REFERENCES "choferes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

