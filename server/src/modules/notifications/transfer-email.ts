const labels: Record<string, string> = {
  CONFIRM: 'Підтверджено', REJECT: 'Відхилено', CANCEL: 'Скасовано',
  DISPATCH: 'Відправлено', RECEIVE: 'Прийнято',
};

function escape(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

type TransferEmail = { code: string; recommendationId: number; donor: string; recipient: string;
  drugName: string; sku: string; quantity: number; status: string; time: Date };

export function transferEmail(event: TransferEmail) {
  const subject = 'PharmaBalance · #' + event.recommendationId + ' · ' + labels[event.code];
  const details = [
    ['Подія', labels[event.code]], ['Статус', event.status], ['Аптека-донор', event.donor],
    ['Аптека-отримувач', event.recipient], ['Товар (SKU)', event.drugName + ' (' + event.sku + ')'],
    ['Кількість', String(event.quantity)], ['Дата й час', event.time.toISOString()],
  ];
  const rows = details.map(([key, value]) => '<tr><th scope="row" style="text-align:left;padding:8px">' + escape(key) +
    '</th><td style="padding:8px;overflow-wrap:anywhere">' + escape(value) + '</td></tr>').join('');
  return { subject, text: [subject, ...details.map(([key,value]) => key + ': ' + value)].join('\n'),
    html: '<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
      '<body style="margin:0;background:#eff6f5;font-family:Arial,sans-serif;color:#173736">' +
      '<div style="max-width:600px;margin:auto;padding:16px"><h1 style="font-size:22px;color:#0c665e">' +
      escape(subject) + '</h1><table style="width:100%;background:#fff;border-collapse:collapse">' + rows + '</table></div></body></html>' };
}
