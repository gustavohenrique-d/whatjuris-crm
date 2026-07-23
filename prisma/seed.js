// WhatJuris CRM — seed (Módulo 1, tarefa 1.6)
// Idempotente: rodar duas vezes não duplica nada.
//
// Cria: 36 permissões, 5 papéis, 1 organização, 1 funil "Captação de
// Clientes" com 7 estágios e 1 usuário com papel owner.
//
// Uso:
//   OWNER_EMAIL=... OWNER_PASSWORD=... OWNER_NAME=... ORG_NAME=... npx prisma db seed

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Catálogo de permissões (chave em inglês, nome em português — CLAUDE.md)
// formato da chave: recurso.acao[.escopo]
// ---------------------------------------------------------------------------

const PERMISSOES = [
    // Contatos (7)
    ['contact.create', 'Criar contatos'],
    ['contact.read.own', 'Ver os próprios contatos'],
    ['contact.read.all', 'Ver todos os contatos'],
    ['contact.update.own', 'Editar os próprios contatos'],
    ['contact.update.all', 'Editar todos os contatos'],
    ['contact.delete', 'Excluir contatos'],
    ['contact.export', 'Exportar contatos'],
    // Negócios (8)
    ['deal.create', 'Criar negócios'],
    ['deal.read.own', 'Ver os próprios negócios'],
    ['deal.read.all', 'Ver todos os negócios'],
    ['deal.update.own', 'Editar os próprios negócios'],
    ['deal.update.all', 'Editar todos os negócios'],
    ['deal.delete', 'Excluir negócios'],
    ['deal.move', 'Mover negócios no funil'],
    ['deal.reassign', 'Transferir responsável de negócios'],
    // Atividades (5)
    ['activity.create', 'Registrar atividades'],
    ['activity.read.own', 'Ver as próprias atividades'],
    ['activity.read.all', 'Ver todas as atividades'],
    ['activity.update.own', 'Editar as próprias atividades'],
    ['activity.delete', 'Excluir atividades'],
    // Funis (2)
    ['pipeline.read', 'Ver funis'],
    ['pipeline.manage', 'Gerenciar funis e estágios'],
    // Usuários (5)
    ['user.invite', 'Convidar usuários'],
    ['user.read', 'Ver usuários'],
    ['user.update', 'Editar usuários'],
    ['user.suspend', 'Suspender usuários'],
    ['user.delete', 'Excluir usuários'],
    // Papéis (2)
    ['role.read', 'Ver papéis e permissões'],
    ['role.manage', 'Gerenciar papéis e permissões'],
    // Campos personalizados (2)
    ['custom_field.read', 'Ver campos personalizados'],
    ['custom_field.manage', 'Gerenciar campos personalizados'],
    // Organização (2)
    ['organization.read', 'Ver dados do escritório'],
    ['organization.update', 'Editar dados do escritório'],
    // Auditoria (1)
    ['audit.read', 'Ver trilha de auditoria'],
    // Relatórios (2)
    ['report.read.own', 'Ver os próprios relatórios'],
    ['report.read.all', 'Ver todos os relatórios'],
];

// ---------------------------------------------------------------------------
// Papéis e suas permissões
// ---------------------------------------------------------------------------

const TODAS = PERMISSOES.map(([key]) => key);

const PAPEIS = [
    {
        key: 'owner',
        name: 'Sócio',
        description: 'Acesso total ao sistema, incluindo configuração do escritório.',
        permissoes: TODAS,
    },
    {
        key: 'senior_lawyer',
        name: 'Advogado Sênior',
        description: 'Gerencia todos os contatos, negócios e o funil; convida usuários.',
        permissoes: [
            'contact.create', 'contact.read.own', 'contact.read.all',
            'contact.update.own', 'contact.update.all', 'contact.delete', 'contact.export',
            'deal.create', 'deal.read.own', 'deal.read.all',
            'deal.update.own', 'deal.update.all', 'deal.delete', 'deal.move', 'deal.reassign',
            'activity.create', 'activity.read.own', 'activity.read.all',
            'activity.update.own', 'activity.delete',
            'pipeline.read', 'pipeline.manage',
            'user.invite', 'user.read',
            'role.read',
            'custom_field.read',
            'organization.read',
            'report.read.own', 'report.read.all',
        ],
    },
    {
        key: 'lawyer',
        name: 'Advogado',
        description: 'Trabalha os próprios contatos e negócios.',
        permissoes: [
            'contact.create', 'contact.read.own', 'contact.update.own',
            'deal.create', 'deal.read.own', 'deal.update.own', 'deal.move',
            'activity.create', 'activity.read.own', 'activity.update.own',
            'pipeline.read', 'user.read', 'custom_field.read',
            'organization.read', 'report.read.own',
        ],
    },
    {
        key: 'assistant',
        name: 'Assistente',
        description: 'Apoia a operação: cadastra e organiza contatos e agenda.',
        permissoes: [
            'contact.create', 'contact.read.all', 'contact.update.all',
            'deal.read.all', 'deal.move',
            'activity.create', 'activity.read.all',
            'pipeline.read', 'user.read', 'custom_field.read', 'organization.read',
        ],
    },
    {
        key: 'intern',
        name: 'Estagiário',
        description: 'Acesso de leitura ao próprio trabalho.',
        permissoes: [
            'contact.read.own', 'deal.read.own',
            'activity.create', 'activity.read.own',
            'pipeline.read', 'custom_field.read', 'organization.read',
        ],
    },
];

// ---------------------------------------------------------------------------
// Funil padrão de captação
// ---------------------------------------------------------------------------

const FUNIL_PADRAO = {
    key: 'captacao',
    name: 'Captação de Clientes',
    estagios: [
        { position: 1, key: 'novo_contato', name: 'Novo Contato', type: 'OPEN', color: '#845adf' },
        { position: 2, key: 'em_triagem', name: 'Em Triagem', type: 'OPEN', color: '#23b7e5' },
        { position: 3, key: 'consulta_agendada', name: 'Consulta Agendada', type: 'OPEN', color: '#26bf94' },
        { position: 4, key: 'proposta_enviada', name: 'Proposta Enviada', type: 'OPEN', color: '#f5b849' },
        { position: 5, key: 'negociacao', name: 'Negociação', type: 'OPEN', color: '#f38a5c' },
        { position: 6, key: 'contratado', name: 'Contratado', type: 'WON', color: '#21ce9e' },
        { position: 7, key: 'perdido', name: 'Perdido', type: 'LOST', color: '#e6533c' },
    ],
};

async function main() {
    // 1. Permissões
    for (const [key, name] of PERMISSOES) {
        const [resource, action, scope] = key.split('.');
        await prisma.permission.upsert({
            where: { key },
            update: { name, resource, action, scope: scope || null },
            create: { key, name, resource, action, scope: scope || null },
        });
    }
    console.log(`✔ ${PERMISSOES.length} permissões`);

    // 2. Papéis + junção papel-permissão
    for (const papel of PAPEIS) {
        const role = await prisma.role.upsert({
            where: { key: papel.key },
            update: { name: papel.name, description: papel.description, isSystem: true },
            create: { key: papel.key, name: papel.name, description: papel.description, isSystem: true },
        });

        const permissions = await prisma.permission.findMany({
            where: { key: { in: papel.permissoes } },
            select: { id: true },
        });

        // sincroniza a junção: remove o que sobrou, insere o que falta
        await prisma.rolePermission.deleteMany({
            where: { roleId: role.id, permissionId: { notIn: permissions.map((p) => p.id) } },
        });
        await prisma.rolePermission.createMany({
            data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
            skipDuplicates: true,
        });
    }
    console.log(`✔ ${PAPEIS.length} papéis`);

    // 3. Organização (singleton)
    const orgName = process.env.ORG_NAME || 'Escritório Demo';
    const orgExistente = await prisma.organization.findFirst();
    if (orgExistente) {
        console.log(`✔ organização já existe: ${orgExistente.name}`);
    } else {
        await prisma.organization.create({
            data: {
                name: orgName,
                botDisplayName: process.env.ORG_BOT_NAME || 'Assistente Virtual',
                timezone: 'America/Sao_Paulo',
                legalAreas: ['trabalhista', 'civel', 'familia', 'previdenciario'],
                // expediente lido pelo agente Agendador (módulo 9)
                businessHours: {
                    mon: ['09:00', '18:00'],
                    tue: ['09:00', '18:00'],
                    wed: ['09:00', '18:00'],
                    thu: ['09:00', '18:00'],
                    fri: ['09:00', '18:00'],
                    sat: null,
                    sun: null,
                },
                // decisão 8: rótulos jurídicos da UI vêm daqui
                settings: {
                    labels: { deal: 'Caso', deals: 'Casos', contact: 'Cliente', contacts: 'Clientes', pipeline: 'Funil' },
                },
            },
        });
        console.log(`✔ organização criada: ${orgName}`);
    }

    // 4. Funil padrão com 7 estágios
    const pipeline = await prisma.pipeline.upsert({
        where: { name: FUNIL_PADRAO.name },
        update: { isDefault: true, key: FUNIL_PADRAO.key },
        create: { key: FUNIL_PADRAO.key, name: FUNIL_PADRAO.name, position: 1, isDefault: true },
    });
    for (const estagio of FUNIL_PADRAO.estagios) {
        await prisma.pipelineStage.upsert({
            where: { pipelineId_key: { pipelineId: pipeline.id, key: estagio.key } },
            update: { name: estagio.name, type: estagio.type, position: estagio.position, color: estagio.color },
            create: { pipelineId: pipeline.id, ...estagio },
        });
    }
    console.log(`✔ funil "${FUNIL_PADRAO.name}" com ${FUNIL_PADRAO.estagios.length} estágios`);

    // 5. Usuário sócio
    const ownerEmail = (process.env.OWNER_EMAIL || 'socio@escritorio.com.br').toLowerCase();
    const ownerName = process.env.OWNER_NAME || 'Sócio Administrador';
    const ownerPassword = process.env.OWNER_PASSWORD || 'Trocar-Esta-Senha-123';

    const ownerRole = await prisma.role.findUnique({ where: { key: 'owner' } });
    const ownerExistente = await prisma.user.findUnique({ where: { email: ownerEmail } });
    if (ownerExistente) {
        console.log(`✔ usuário sócio já existe: ${ownerEmail}`);
    } else {
        const passwordHash = await bcrypt.hash(ownerPassword, 12);
        await prisma.user.create({
            data: {
                name: ownerName,
                email: ownerEmail,
                passwordHash,
                status: 'ACTIVE',
                roleId: ownerRole.id,
            },
        });
        console.log(`✔ usuário sócio criado: ${ownerEmail}`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
