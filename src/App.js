// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx-js-style';
// eslint-disable-next-line no-unused-vars
import { saveAs } from 'file-saver';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter, faSortUp, faSortDown, faFileExcel, faFileUpload } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilters, setActiveFilters] = useState({});
  const [filterSelections, setFilterSelections] = useState({});
  const [openDropdown, setOpenDropdown] = useState(null);
  const filterDropdownRef = useRef(null);
  const filterIconRefs = useRef({});
  const [filterDropdownPosition, setFilterDropdownPosition] = useState({ top: 0, left: 0 });
  const [overdueCount, setOverdueCount] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: 'Data Limite', direction: 'ascending' });
  const [selectedFileName, setSelectedFileName] = useState('');

  const tableHeaders = useMemo(() => [
    'Chamado',
    'Numero Referencia',
    'Contratante',
    'Serviço',
    'Status',
    'Data Limite',
    'Cliente',
    'CNPJ / CPF',
    'Cidade',
    'Técnico',
    'Prestador',
    'Justificativa do Abono',
  ], []);

  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO'
  ], []);

  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return str;
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  }, []);

  // Esta função agora é usada para normalizar o status para comparação com allowedStatuses
  const normalizeStatusValue = useCallback((status) => {
    const normalized = normalizeForComparison(status || ''); // Garante que status não é undefined
    if (normalized.includes('ENCAMINHADA')) return 'ENCAMINHADA';
    if (normalized.includes('EM TRANSFERENCIA')) return 'EM TRANSFERÊNCIA';
    if (normalized.includes('EM CAMPO')) return 'EM CAMPO';
    if (normalized.includes('REENCAMINHADO')) return 'REENCAMINHADO';
    if (normalized.includes('PROCEDIMENTO TECNICO')) return 'PROCEDIMENTO TÉCNICO';
    return status; // Retorna o original se não houver normalização específica
  }, [normalizeForComparison]);

  // Função para formatar a Data Limite para DD/MM/AAAA
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    try {
      // CORREÇÃO AQUI: Parsear data explicitamente como DD/MM/YYYY
      const parts = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (parts) {
        const [, day, month, year] = parts;
        // Cria a data no formato YYYY-MM-DD para evitar problemas de fuso horário
        const date = new Date(`${year}-${month}-${day}T00:00:00`);
        if (!isNaN(date.getTime())) {
          return `${day}/${month}/${year}`; // Retorna no formato DD/MM/YYYY
        }
      }
      // Fallback para Date object se o regex falhar (menos confiável para DD/MM/YYYY)
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('pt-BR');
      }
    } catch (e) {
      console.error("Erro ao formatar data:", dateString, e);
    }
    return dateString; // Retorna a string original se não conseguir formatar
  }, []);

  // Função para formatar CNPJ/CPF
  const formatCnpjCpf = useCallback((value) => {
    if (!value) return '';
    const cleaned = String(value).replace(/\D/g, ''); // Remove tudo que não é dígito
    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); // CPF
    }
    if (cleaned.length === 14) {
      return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'); // CNPJ
    }
    return value; // Retorna o valor original se não for CPF nem CNPJ
  }, []);

  // Função para verificar se uma data está atrasada ou vence hoje
  const isOverdueOrDueToday = useCallback((dateString) => {
    if (!dateString) return { isOverdue: false, isDueToday: false };
    try {
      // CORREÇÃO AQUI: Parsear data explicitamente como DD/MM/YYYY
      const parts = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      let date;
      if (parts) {
        // Cria a data no formato YYYY-MM-DD para evitar problemas de fuso horário
        date = new Date(`${parts[3]}-${parts[2]}-${parts[1]}T00:00:00`);
      } else {
        // Fallback para Date object se o regex falhar (menos confiável)
        date = new Date(dateString);
      }

      if (isNaN(date.getTime())) {
        return { isOverdue: false, isDueToday: false };
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

      const limitDate = new Date(date);
      limitDate.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

      const isOverdue = limitDate < today;
      const isDueToday = limitDate.getTime() === today.getTime();

      return { isOverdue, isDueToday };
    } catch (e) {
      console.error("Erro ao verificar atraso/vencimento:", dateString, e);
      return { isOverdue: false, isDueToday: false };
    }
  }, []);

  // Efeito para fechar o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        let isFilterIconClick = false;
        for (const key in filterIconRefs.current) {
          if (filterIconRefs.current[key] && filterIconRefs.current[key].contains(event.target)) {
            isFilterIconClick = true;
            break;
          }
        }
        if (!isFilterIconClick) {
          setOpenDropdown(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Efeito para aplicar filtros e ordenação sempre que 'data' ou 'activeFilters' ou 'sortConfig' mudar
  useEffect(() => {
    let currentFilteredData = [...data];

    // Aplica o filtro de status permanente
    currentFilteredData = currentFilteredData.filter(row => {
      const status = row['Status'] ? normalizeForComparison(row['Status']) : '';
      return allowedStatuses.some(allowed => normalizeForComparison(allowed) === status);
    });

    // Aplica outros filtros ativos
    Object.keys(activeFilters).forEach(column => {
      const selectedOptions = activeFilters[column];
      if (selectedOptions && selectedOptions.length > 0) {
        currentFilteredData = currentFilteredData.filter(row => {
          const cellValue = row[column] ? normalizeForComparison(row[column]) : '';
          return selectedOptions.some(option => normalizeForComparison(option) === cellValue);
        });
      }
    });

    // Calcula o contador de atrasos
    let count = 0;
    currentFilteredData.forEach(row => {
      const dataLimiteStr = row['Data Limite']; // Pega a string original da data
      const { isOverdue } = isOverdueOrDueToday(dataLimiteStr); // Usa a função de verificação
      if (isOverdue) {
        count++;
      }
    });
    setOverdueCount(count);

    // Aplica ordenação
    if (sortConfig.key) {
      currentFilteredData.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (sortConfig.key === 'Data Limite') {
          // CORREÇÃO AQUI: Parsear datas para ordenação de forma consistente
          const dateA = aValue ? new Date(aValue.split('/').reverse().join('-')) : new Date(0);
          const dateB = bValue ? new Date(bValue.split('/').reverse().join('-')) : new Date(0);
          if (dateA < dateB) return sortConfig.direction === 'ascending' ? -1 : 1;
          if (dateA > dateB) return sortConfig.direction === 'ascending' ? 1 : -1;
          return 0;
        } else {
          const valA = aValue ? normalizeForComparison(aValue) : '';
          const valB = bValue ? normalizeForComparison(bValue) : '';
          if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
          if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
          return 0;
        }
      });
    }

    setFilteredData(currentFilteredData);

  }, [data, activeFilters, sortConfig, normalizeForComparison, allowedStatuses, isOverdueOrDueToday]);


  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setLoading(true);
    setError(null);
    setData([]); // Limpa os dados anteriores
    setFilteredData([]); // Limpa os dados filtrados anteriores
    setActiveFilters({}); // Limpa filtros ativos
    setFilterSelections({}); // Limpa seleções de filtro
    setOpenDropdown(null); // Fecha qualquer dropdown aberto

    const formData = new FormData();
    formData.append('file', file);

    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.post(`${backendUrl}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const rawData = response.data;

      // Processa os dados para garantir que o status seja normalizado e filtrado
      const processedData = rawData.filter(row => {
        const status = normalizeStatusValue(row['Status']);
        return allowedStatuses.includes(status);
      });

      setData(processedData);
      // Inicializa filterSelections com todas as opções únicas para cada coluna
      const initialFilterSelections = {};
      tableHeaders.forEach(header => {
        const uniqueValues = [...new Set(processedData.map(row => row[header] || ''))]
          .filter(value => value !== null && value !== undefined)
          .sort((a, b) => normalizeForComparison(a).localeCompare(normalizeForComparison(b), 'pt-BR', { sensitivity: 'base' }));
        initialFilterSelections[header] = uniqueValues.map(value => ({ value, checked: true }));
      });
      setFilterSelections(initialFilterSelections);

    } catch (err) {
      console.error('Erro ao fazer upload do arquivo:', err);
      setError('Erro ao carregar o arquivo. Verifique o formato e tente novamente.');
      setData([]); // Garante que os dados sejam limpos em caso de erro
    } finally {
      setLoading(false);
    }
  };

  const getUniqueColumnValues = useCallback((columnName) => {
    const values = data.map(row => row[columnName]);
    return [...new Set(values)].filter(Boolean).sort((a, b) => {
      if (typeof a === 'string' && typeof b === 'string') {
        return a.localeCompare(b);
      }
      return 0;
    });
  }, [data]);

  const handleFilterClick = useCallback((columnName, event) => {
    setOpenDropdown(openDropdown === columnName ? null : columnName);

    if (filterIconRefs.current[columnName] && openDropdown !== columnName) {
      const rect = filterIconRefs.current[columnName].getBoundingClientRect();
      setFilterDropdownPosition({
        top: rect.bottom + window.scrollY + 5,
        left: rect.left + window.scrollX,
      });
    }

    // Inicializa as seleções de filtro se ainda não existirem
    if (!filterSelections[columnName]) {
      setFilterSelections(prev => ({
        ...prev,
        [columnName]: getUniqueColumnValues(columnName).map(value => ({ value, checked: true }))
      }));
    }
  }, [openDropdown, filterSelections, getUniqueColumnValues]);

  const handleFilterOptionChange = useCallback((columnName, option, isChecked) => {
    setFilterSelections(prev => {
      const newSelections = { ...prev };
      if (newSelections[columnName]) {
        newSelections[columnName] = newSelections[columnName].map(item =>
          item.value === option ? { ...item, checked: isChecked } : item
        );
      }
      return newSelections;
    });
  }, []);

  const applyFilter = useCallback((columnName) => {
    setActiveFilters(prev => {
      const selectedOptions = filterSelections[columnName]
        .filter(option => option.checked)
        .map(option => option.value);
      return { ...prev, [columnName]: selectedOptions };
    });
    setOpenDropdown(null);
  }, [filterSelections]);

  const clearFilter = useCallback((columnName) => {
    setFilterSelections(prev => ({
      ...prev,
      [columnName]: getUniqueColumnValues(columnName).map(value => ({ value, checked: true }))
    }));
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[columnName];
      return newFilters;
    });
    setOpenDropdown(null);
  }, [getUniqueColumnValues]);

  const handleSort = useCallback((key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) {
      return null;
    }
    return sortConfig.direction === 'ascending' ? faSortUp : faSortDown;
  };

  const getRowClass = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const { isOverdue, isDueToday } = isOverdueOrDueToday(dataLimiteStr);
    const justificativa = row['Justificativa do Abono'] ? row['Justificativa do Abono'].trim() : '';

    // CORREÇÃO AQUI: Vermelho intenso para TODAS as linhas atrasadas (incluindo "FALTA ABONAR")
    if (isOverdue) {
      return 'overdue-strong';
    }
    // Amarelo para vencendo hoje
    if (isDueToday) {
      return 'due-today';
    }
    return ''; // Nenhuma classe para outros casos
  }, [isOverdueOrDueToday]);

  const getCellContent = useCallback((header, row) => {
    let value = row[header];

    if (header === 'Data Limite') {
      return formatDataLimite(value);
    }
    if (header === 'CNPJ / CPF') {
      return formatCnpjCpf(value);
    }
    if (header === 'Justificativa do Abono') {
      const dataLimiteStr = row['Data Limite'];
      const { isOverdue } = isOverdueOrDueToday(dataLimiteStr);
      const justificativa = row['Justificativa do Abono'];

      // CORREÇÃO AQUI: Exibir "FALTA ABONAR" se atrasado e justificativa vazia
      if (isOverdue && (!justificativa || justificativa.trim() === '')) {
        return 'FALTA ABONAR';
      }
      return value;
    }
    return value;
  }, [formatDataLimite, formatCnpjCpf, isOverdueOrDueToday]);

  const getCellClass = useCallback((row, header) => {
    const dataLimiteStr = row['Data Limite'];
    const { isOverdue } = isOverdueOrDueToday(dataLimiteStr);
    const justificativa = row['Justificativa do Abono'];

    // CORREÇÃO AQUI: Classe para a célula "FALTA ABONAR" (roxo)
    if (header === 'Justificativa do Abono' && isOverdue && (!justificativa || justificativa.trim() === '')) {
      return 'falta-abonar-cell';
    }
    return '';
  }, [isOverdueOrDueToday]);


  const exportToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Filtra apenas os itens pendentes de hoje (atrasados e vencendo hoje)
    const dataToExport = data.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      const { isOverdue, isDueToday } = isOverdueOrDueToday(dataLimiteStr);
      return isOverdue || isDueToday;
    }).map(row => {
      // Mapeia os dados para o formato de exportação, formatando a data e justificativa
      const newRow = { ...row };
      newRow['Data Limite'] = formatDataLimite(row['Data Limite']); // Formata a data para DD/MM/YYYY
      newRow['CNPJ / CPF'] = formatCnpjCpf(row['CNPJ / CPF']); // Formata CNPJ/CPF

      const justificativa = newRow['Justificativa do Abono'];
      const { isOverdue } = isOverdueOrDueToday(row['Data Limite']); // Usa a data original para verificar atraso
      if (isOverdue && (!justificativa || justificativa.trim() === '')) {
        newRow['Justificativa do Abono'] = 'FALTA ABONAR';
      }
      return newRow;
    });

    if (dataToExport.length === 0) {
      alert('Não há ordens de serviço pendentes para exportar hoje.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);

    // Aplica estilos de cor de fundo às células no Excel
    dataToExport.forEach((row, rowIndex) => {
      const excelRowIndex = rowIndex + 2; // +1 para cabeçalho, +1 para 0-index
      const dataLimiteStr = row['Data Limite']; // Pega a data já formatada para exibição
      const { isOverdue, isDueToday } = isOverdueOrDueToday(dataLimiteStr); // Usa a data formatada para verificar atraso/hoje

      let fillColor = 'FFFFFF'; // Branco padrão
      let fontColor = '000000'; // Preto padrão

      if (isOverdue) {
        fillColor = 'FF0000'; // Vermelho
        fontColor = 'FFFFFF'; // Branco
      } else if (isDueToday) {
        fillColor = 'FFFF00'; // Amarelo
        fontColor = '000000'; // Preto
      }

      // Aplica o estilo a todas as células da linha
      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: excelRowIndex - 1, c: colIndex });
        if (!ws[cellRef]) ws[cellRef] = {};
        ws[cellRef].s = {
          fill: { fgColor: { rgb: fillColor } },
          font: { color: { rgb: fontColor } },
          alignment: { horizontal: 'left' },
          border: {
            top: { style: 'thin', color: { auto: 1 } },
            bottom: { style: 'thin', color: { auto: 1 } },
            left: { style: 'thin', color: { auto: 1 } },
            right: { style: 'thin', color: { auto: 1 } },
          },
        };
      });

      // Estilo específico para "FALTA ABONAR" na célula de Justificativa do Abono
      const justificativaColIndex = tableHeaders.indexOf('Justificativa do Abono');
      if (justificativaColIndex !== -1) {
        const justificativaValue = row['Justificativa do Abono'];
        if (justificativaValue === 'FALTA ABONAR') {
          const cellRef = XLSX.utils.encode_cell({ r: excelRowIndex - 1, c: justificativaColIndex });
          if (!ws[cellRef]) ws[cellRef] = {};
          ws[cellRef].s = {
            fill: { fgColor: { rgb: '800080' } }, // Roxo
            font: { color: { rgb: 'FFFFFF' }, bold: true },
            alignment: { horizontal: 'left' },
            border: {
              top: { style: 'thin', color: { auto: 1 } },
              bottom: { style: 'thin', color: { auto: 1 } },
              left: { style: 'thin', color: { auto: 1 } },
              right: { style: 'thin', color: { auto: 1 } },
            },
          };
        }
      }
    });

    // Estilo para o cabeçalho
    tableHeaders.forEach((header, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = {
        fill: { fgColor: { rgb: "F2F2F2" } }, // Cor de fundo do cabeçalho
        font: { bold: true, color: { rgb: "333333" } }, // Texto em negrito e escuro
        alignment: { horizontal: "left" }
      };
    });

    // Ajusta a largura das colunas
    const colWidths = tableHeaders.map(header => ({
      wch: Math.max(
        header.length,
        ...dataToExport.map(row => (row[header] ? String(row[header]).length : 0))
      ) + 2
    }));
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes Hoje');
    XLSX.writeFile(wb, 'Ordens_Servico_Pendentes_Hoje.xlsx');
  }, [data, filteredData, tableHeaders, isOverdueOrDueToday, formatDataLimite, formatCnpjCpf, normalizeForComparison]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de Ordens de Serviço</h1>
        <div className="file-upload-container">
          <input
            type="file"
            id="file-upload"
            accept=".csv"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <label htmlFor="file-upload" className="custom-file-upload">
            <FontAwesomeIcon icon={faFileUpload} />
            {selectedFileName ? ` ${selectedFileName}` : ' Carregar CSV'}
          </label>
          {selectedFileName && <span className="file-name-display">{selectedFileName}</span>}
        </div>
        <div className="action-buttons">
          <button onClick={exportToExcel} className="export-button" disabled={data.length === 0}>
            <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes Hoje
          </button>
          <div className="overdue-count">
            Ordens de Serviço em Atraso: <span className="count-number">{overdueCount}</span>
          </div>
        </div>
      </header>

      <main className="App-main">
        {loading && <p className="loading-message">Carregando dados...</p>}
        {error && <p className="error-message">{error}</p>}

        {!loading && !error && filteredData.length === 0 && data.length === 0 && (
          <p className="no-data-message">Faça o upload de um arquivo CSV para começar.</p>
        )}

        {!loading && !error && filteredData.length === 0 && data.length > 0 && (
          <p className="no-data-message">Nenhum dado corresponde aos filtros aplicados.</p>
        )}

        {!loading && !error && filteredData.length > 0 && (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  {tableHeaders.map((header) => (
                    <th key={header} className={`col-${header.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
                      <div className="header-content">
                        <span className="sortable-header" onClick={() => handleSort(header)}>
                          {header}
                          {sortConfig.key === header && (
                            <FontAwesomeIcon
                              icon={sortConfig.direction === 'ascending' ? faSortUp : faSortDown}
                              className="sort-icon"
                            />
                          )}
                        </span>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${activeFilters[header] && activeFilters[header].length > 0 ? 'filter-active' : ''}`}
                          onClick={(e) => handleFilterClick(header, e)}
                          ref={el => filterIconRefs.current[header] = el}
                        />
                      </div>

                      {openDropdown === header && (
                        <div
                          className="filter-dropdown"
                          ref={filterDropdownRef}
                          style={{ top: filterDropdownPosition.top, left: filterDropdownPosition.left }}
                        >
                          <div className="filter-options-container">
                            {getUniqueColumnValues(header).map(option => (
                              <label key={option} className="filter-option">
                                <input
                                  type="checkbox"
                                  checked={(filterSelections[header] || []).includes(option)}
                                  onChange={(e) => handleFilterOptionChange(header, option, e.target.checked)}
                                />
                                {option}
                              </label>
                            ))}
                          </div>
                          <div className="filter-actions">
                            <button onClick={() => applyFilter(header)}>Aplicar</button>
                            <button onClick={() => clearFilter(header)}>Limpar</button>
                          </div>
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, rowIndex) => (
                  <tr key={rowIndex} className={getRowClass(row)}>
                    {tableHeaders.map((header) => (
                      <td key={header} className={getCellClass(row, header)}>
                        {getCellContent(header, row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
