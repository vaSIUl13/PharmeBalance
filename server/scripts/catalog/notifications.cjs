async function notifyCatalogAdministrators(tx, title, message) {
  const users = await tx.userAccount.findMany({
    where: { isActive: true, role: { code: { in: ['admin', 'superadmin'] } } },
    select: { userId: true },
  });
  if (users.length) {
    await tx.systemNotification.createMany({ data: users.map(({ userId }) => ({ userId, title, message })) });
  }
}

module.exports = { notifyCatalogAdministrators };
