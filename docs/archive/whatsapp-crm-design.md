# CRM y WhatsApp: referencia de diseno rescatada

Estado: diseno archivado. No hay rutas, migraciones ni integracion activa en este rescate.

## Trabajo funcional preservado

CRM de prospectos con etapas nuevo, contactado, calificado, propuesta, convertido y perdido; prioridades alta/media/baja; fuentes web, Instagram, TikTok, WhatsApp, referido, Google, llamada y otro. Busqueda, filtros, valor estimado, notas, primer/ultimo contacto y estadisticas de conversion. Biblioteca de plantillas, historial y enlaces para envio manual. Las plantillas se preservan en whatsapp-templates.md como borradores genericos, no como plantillas aprobadas por Meta.

## Modelo conceptual

- Prospecto: tenant obligatorio, propietario, nombre/contacto minimo necesario, consentimiento/preferencia de canal, fuente, etapa y trazabilidad. Ningun dato real se incluye aqui.
- Cuenta WhatsApp: tenant, propietario, ID verificado de cuenta/numero del proveedor y referencia a boveda para credenciales.
- Mensaje: tenant, cuenta, prospecto del mismo tenant, destinatario, direccion, tipo, clave idempotente, ID del proveedor y fechas de estado.
- Plantilla: tenant, version, categoria, texto con marcadores, aprobacion interna y, cuando corresponda, estado de aprobacion del proveedor. No insertar automaticamente para el primer administrador.
- Evento/auditoria: identificador unico, hash, verificacion, correlacion, actor y resultado. Nunca secretos completos ni payloads personales indiscriminados.

## Flujo futuro

Formulario o webhook validado -> cuenta/tenant resueltos -> evento persistido y deduplicado -> prospecto identificado dentro del tenant -> borrador/plantilla -> revision humana cuando proceda -> solicitud de envio -> proveedor -> actualizacion de estado verificada.

GET/POST de webhook, consultas de prospectos, cambios de etapa, biblioteca de plantillas e historial son contratos conceptuales. No se importan los endpoints antiguos como implementacion. El formulario publico necesita identificacion controlada del negocio, proteccion contra abuso, limites, validacion y consentimiento; no debe aceptar asignacion arbitraria de tenant.

## Problemas descartados

- Fallback fijo de verificacion y ausencia de validacion de firma en eventos entrantes.
- Asignacion al primer administrador de la base: mezcla de propietarios y comportamiento no determinista.
- Indicador de enviado actualizado incluso cuando la API solo simulaba el envio.
- Enlace manual dirigido a un numero fijo del despacho en lugar del destinatario solicitado.
- Asociacion de lead_id sin comprobar previamente su pertenencia antes de enviar/registrar; una FK sola no garantiza aislamiento tenant.
- Mensajes duplicables por reintentos y estados externos sin protocolo robusto de reconciliacion.
- Plantillas con identidad/contacto fijo y configuracion que exponia el token de verificacion a usuarios autenticados.

## Requisitos obligatorios

1. Firma del webhook sobre cuerpo original, desafio con configuracion explicita, proteccion replay y rechazo seguro cuando falten secretos.
2. Mapeo cuenta/numero externo -> tenant -> propietario. Nunca usar primer admin. Verificar cuenta y destinatario antes de cualquier accion externa.
3. Boveda de secretos, permisos minimos, rotacion y acceso auditado. No tokens en BD en claro, bundle, archivos versionados o logs.
4. Aislamiento en todas las consultas, asociaciones y restricciones de datos. Tenant obligatorio y verificacion de pertenencia antes del envio, no despues.
5. Estados distintos: borrador, aprobado, en_cola, aceptado_por_proveedor, entregado, leido, fallido y resultado_desconocido. Un enlace abierto o modo manual/simulado no demuestra entrega. Solo eventos verificados o reconciliacion con proveedor confirman estados externos.
6. Idempotencia de entrada/salida, unicidad de eventos y bandeja de salida transaccional; concurrencia y errores ambiguos requieren reconciliacion antes de reenviar.
7. Destinatario normalizado y confirmado; enlace manual construido para ese destinatario. No inferir consentimiento del hecho de tener un telefono.
8. Auditoria de actor, aprobacion, cuenta, destinatario, intento y resultado; minimizacion/retencion de datos y errores sanitizados.
9. Respetar reglas actuales del canal, consentimiento, bajas y restricciones de plantillas antes de habilitar envios. Validar estas reglas con el proveedor en la implementacion futura.

## Pruebas de aceptacion futuras

Firma valida/ausente/incorrecta, replay, duplicados concurrentes, cuentas desconocidas, dos tenants con contactos similares, lead de otro tenant, cuenta sin propietario, simulacion sin estado enviado, destinatario correcto, timeout ambiguo, entrega fuera de orden, reintento, revocacion de permisos y ausencia de secretos en respuestas/logs. Fixtures y credenciales aleatorias por corrida. No conectar proveedores reales en QA por defecto.
