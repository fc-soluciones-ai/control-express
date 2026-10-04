-- CreateTable
CREATE TABLE "mensajes_ubicacion" (
    "id" TEXT NOT NULL,
    "mensaje_id" TEXT NOT NULL,
    "telefono_crudo" TEXT NOT NULL,
    "telefono" TEXT,
    "latitud" DOUBLE PRECISION NOT NULL,
    "longitud" DOUBLE PRECISION NOT NULL,
    "nombre" TEXT,
    "direccion" TEXT,
    "estado" TEXT NOT NULL,
    "cliente_id" TEXT,
    "candidatos" INTEGER NOT NULL DEFAULT 0,
    "recibido_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resuelto_en" TIMESTAMP(3),
    "resuelto_por" TEXT,

    CONSTRAINT "mensajes_ubicacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mensajes_ubicacion_mensaje_id_key" ON "mensajes_ubicacion"("mensaje_id");

-- CreateIndex
CREATE INDEX "mensajes_ubicacion_estado_recibido_en_idx" ON "mensajes_ubicacion"("estado", "recibido_en");

-- CreateIndex
CREATE INDEX "mensajes_ubicacion_telefono_idx" ON "mensajes_ubicacion"("telefono");

-- AddForeignKey
ALTER TABLE "mensajes_ubicacion" ADD CONSTRAINT "mensajes_ubicacion_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

