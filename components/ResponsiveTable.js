import { Children, cloneElement, isValidElement } from 'react';

function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!isValidElement(node)) return '';
  return Children.toArray(node.props.children).map(textContent).join('');
}

export default function ResponsiveTable({ children, label }) {
  const sections = Children.toArray(children);
  const head = sections.find((section) => section.type === 'thead');
  const headerRow = Children.toArray(head?.props.children)[0];
  const labels = Children.toArray(headerRow?.props.children).map((cell) => textContent(cell) || 'Actions');
  const content = sections.map((section) => {
    if (!isValidElement(section)) return section;
    const rows = Children.map(section.props.children, (row) => {
      if (!isValidElement(row)) return row;
      return cloneElement(row, { role: 'row' }, Children.map(row.props.children, (cell, index) => {
        if (!isValidElement(cell)) return cell;
        return cloneElement(cell, {
          role: section.type === 'thead' ? 'columnheader' : 'cell',
          ...(section.type === 'tbody' ? { 'data-label': labels[index] } : {}),
        });
      }));
    });
    return cloneElement(section, { role: 'rowgroup' }, rows);
  });
  return <div className="table-region"><table className="simple-table responsive-table" role="table" aria-label={label}>{content}</table></div>;
}
