-- AlterTable
ALTER TABLE "registros_mantenimiento" ADD COLUMN     "fecha_factura" TIMESTAMP(3),
ADD COLUMN     "numero_factura" TEXT,
ADD COLUMN     "origen" TEXT NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "lecturas_foto" (
    "id" TEXT NOT NULL,
    "chofer_id" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "contenido" BYTEA,
    "tipo_mime" TEXT NOT NULL,
    "huella" TEXT NOT NULL,
    "legible" BOOLEAN NOT NULL,
    "motivo" TEXT,
    "kilometraje" INTEGER,
    "monto" INTEGER,
    "fecha_factura" TIMESTAMP(3),
    "gasolinera" TEXT,
    "numero_factura" TEXT,
    "litros" DOUBLE PRECISION,
    "observacion" TEXT,
    "modelo" TEXT NOT NULL,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usada_en" TIMESTAMP(3),
    "clave_uso" TEXT,
    "gasto_id" TEXT,

    CONSTRAINT "lecturas_foto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lecturas_foto_chofer_id_creada_en_idx" ON "lecturas_foto"("chofer_id", "creada_en");

-- CreateIndex
CREATE INDEX "lecturas_foto_huella_idx" ON "lecturas_foto"("huella");

-- AddForeignKey
ALTER TABLE "lecturas_foto" ADD CONSTRAINT "lecturas_foto_chofer_id_fkey" FOREIGN KEY ("chofer_id") REFERENCES "choferes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecturas_foto" ADD CONSTRAINT "lecturas_foto_gasto_id_fkey" FOREIGN KEY ("gasto_id") REFERENCES "registros_mantenimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

