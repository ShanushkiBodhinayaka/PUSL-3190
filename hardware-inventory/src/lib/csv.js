export function normalizeHeader(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function parseNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(String(value).replace(/[$,]/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
}

export function findColumn(headers, candidates) {
    return headers.find((header) => candidates.includes(header));
}

export function getCell(cells, index) {
    return index >= 0 ? String(cells[index] || '').trim() : '';
}

export function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const nextChar = text[index + 1];

        if (char === '"' && inQuotes && nextChar === '"') {
            field += '"';
            index += 1;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            row.push(field);
            field = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') index += 1;
            row.push(field);
            if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
            row = [];
            field = '';
        } else {
            field += char;
        }
    }

    row.push(field);
    if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
    return rows;
}

function escapeCsvCell(value) {
    const text = String(value ?? '');
    if (!/[",\r\n]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows, headers) {
    const lines = [headers.map(escapeCsvCell).join(',')];
    for (const row of rows) {
        lines.push(headers.map((header) => escapeCsvCell(row[header])).join(','));
    }
    return lines.join('\r\n');
}
