-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombre_buscable" TEXT NOT NULL,
    "telefono" TEXT,
    "es_celular" BOOLEAN NOT NULL DEFAULT false,
    "direccion_texto" TEXT NOT NULL,
    "calidad_direccion" TEXT NOT NULL,
    "correo" TEXT,
    "estado" TEXT NOT NULL,
    "telefono_compartido" BOOLEAN NOT NULL DEFAULT false,
    "nombre_repetido" BOOLEAN NOT NULL DEFAULT false,
    "origen_carga" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telefonos_cliente" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "es_celular" BOOLEAN NOT NULL,
    "origen" TEXT NOT NULL,
    "como_venia" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "verificado_en" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telefonos_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_ubicacion" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "telefono_id" TEXT,
    "token" TEXT NOT NULL,
    "telefono_destino" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "tanda" INTEGER NOT NULL,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviada_en" TIMESTAMP(3),
    "abierta_en" TIMESTAMP(3),
    "respondida_en" TIMESTAMP(3),
    "expira_en" TIMESTAMP(3) NOT NULL,
    "rechazada_en" TIMESTAMP(3),
    "texto_aceptado" TEXT,
    "aceptado_en" TIMESTAMP(3),
    "ip" TEXT,

    CONSTRAINT "solicitudes_ubicacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ubicaciones_cliente" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "solicitud_id" TEXT,
    "latitud" DOUBLE PRECISION NOT NULL,
    "longitud" DOUBLE PRECISION NOT NULL,
    "precision_metros" DOUBLE PRECISION,
    "origen" TEXT NOT NULL,
    "chofer_id" TEXT,
    "nota" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PROPUESTA',
    "revisada_en" TIMESTAMP(3),
    "revisada_por" TEXT,
    "ip" TEXT,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ubicaciones_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_clave_key" ON "clientes"("clave");

-- CreateIndex
CREATE INDEX "clientes_estado_idx" ON "clientes"("estado");

-- CreateIndex
CREATE INDEX "clientes_telefono_idx" ON "clientes"("telefono");

-- CreateIndex
CREATE INDEX "clientes_nombre_buscable_idx" ON "clientes"("nombre_buscable");

-- CreateIndex
CREATE INDEX "telefonos_cliente_numero_idx" ON "telefonos_cliente"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "telefonos_cliente_cliente_id_numero_key" ON "telefonos_cliente"("cliente_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "solicitudes_ubicacion_token_key" ON "solicitudes_ubicacion"("token");

-- CreateIndex
CREATE INDEX "solicitudes_ubicacion_cliente_id_creada_en_idx" ON "solicitudes_ubicacion"("cliente_id", "creada_en");

-- CreateIndex
CREATE INDEX "solicitudes_ubicacion_estado_idx" ON "solicitudes_ubicacion"("estado");

-- CreateIndex
CREATE INDEX "solicitudes_ubicacion_tanda_idx" ON "solicitudes_ubicacion"("tanda");

-- CreateIndex
CREATE INDEX "ubicaciones_cliente_cliente_id_creada_en_idx" ON "ubicaciones_cliente"("cliente_id", "creada_en");

-- CreateIndex
CREATE INDEX "ubicaciones_cliente_estado_idx" ON "ubicaciones_cliente"("estado");

-- AddForeignKey
ALTER TABLE "telefonos_cliente" ADD CONSTRAINT "telefonos_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_ubicacion" ADD CONSTRAINT "solicitudes_ubicacion_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_ubicacion" ADD CONSTRAINT "solicitudes_ubicacion_telefono_id_fkey" FOREIGN KEY ("telefono_id") REFERENCES "telefonos_cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ubicaciones_cliente" ADD CONSTRAINT "ubicaciones_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ubicaciones_cliente" ADD CONSTRAINT "ubicaciones_cliente_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_ubicacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ubicaciones_cliente" ADD CONSTRAINT "ubicaciones_cliente_chofer_id_fkey" FOREIGN KEY ("chofer_id") REFERENCES "choferes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

