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

  // eslint-disable-next-line no-unused-vars
  const normalizeStatusValue = useCallback((status) => {
    if (typeof status !== 'string') return ''; // Retorna string vazia para evitar erro de .includes
    const normalized = normalizeForComparison(status);
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
      // Tenta parsear com o formato DD/MM/YYYY HH:MM:SS ou DD/MM/YYYY
      const parts = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?/);
      if (parts) {
        const [, day, month, year] = parts;
        return `${day}/${month}/${year}`;
      }
      // Fallback para Date object se o regex falhar
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('pt-BR');
      }
    } catch (e) {
      console.error("Erro ao formatar data:", dateString, e);
    }
    return dateString; // Retorna a string original se não conseguir formatar
  }, []);

  // Função para verificar se uma data está atrasada ou vence hoje
  const isOverdueOrDueToday = useCallback((dateString) => {
    if (!dateString) return { isOverdue: false, isDueToday: false };

    try {
      // Tenta parsear com o formato DD/MM/YYYY HH:MM:SS ou DD/MM/YYYY
      const parts = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?/);
      let date;
      if (parts) {
        const [, day, month, year, hour = '00', minute = '00', second = '00'] = parts;
        // Cria a data no formato YYYY-MM-DD para evitar problemas de fuso horário
        date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
      } else {
        // Fallback para Date object se o regex falhar
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
      console.error("Erro ao verificar data de atraso:", dateString, e);
      return { isOverdue: false, isDueToday: false };
    }
  }, []);

  // Função para determinar a classe CSS da linha
  const getRowClassByDataLimite = useCallback((rowData) => {
    const { isOverdue, isDueToday } = isOverdueOrDueToday(rowData['Data Limite']);
    const justificativa = rowData['Justificativa do Abono'] ? rowData['Justificativa do Abono'].toUpperCase().trim() : '';

    // Prioridade 1: Atrasado (vermelho intenso)
    if (isOverdue) {
      return 'overdue-strong';
    }
    // Prioridade 2: Vence hoje (amarelo)
    if (isDueToday) {
      return 'due-today';
    }
    // Prioridade 3: "FALTA ABONAR" (roxo) - APENAS se não for atrasado ou vencendo hoje
    // E se o status for um dos permitidos (para não colorir linhas irrelevantes)
    const status = rowData['Status'] ? normalizeForComparison(rowData['Status']) : '';
    const isAllowedStatus = allowedStatuses.some(s => normalizeForComparison(s) === status);

    if (isAllowedStatus && justificativa === 'FALTA ABONAR') {
      return 'falta-abonar';
    }

    return ''; // Nenhuma classe específica
  }, [isOverdueOrDueToday, normalizeForComparison, allowedStatuses]);


  // Efeito para fechar o dropdown de filtro ao clicar fora
  useEffect(() => {
    function handleClickOutside(event) {
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
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Efeito para calcular o contador de atrasos
  useEffect(() => {
    const count = filteredData.filter(row => {
      const { isOverdue } = isOverdueOrDueToday(row['Data Limite']);
      return isOverdue;
    }).length;
    setOverdueCount(count);
  }, [filteredData, isOverdueOrDueToday]);


  // Processa os dados para filtragem e ordenação
  const processedData = useMemo(() => {
    let currentData = [...data];

    // 1. Filtragem de Status Permanente (APENAS os 5 permitidos)
    currentData = currentData.filter(row => {
      const status = row['Status'] ? normalizeForComparison(row['Status']) : '';
      // Verifica se o status normalizado está na lista de allowedStatuses normalizados
      return allowedStatuses.some(allowed => normalizeForComparison(allowed) === status);
    });

    // 2. Aplica filtros de coluna
    currentData = currentData.filter(row => {
      return tableHeaders.every(header => {
        if (!activeFilters[header] || activeFilters[header].length === 0) {
          return true; // Nenhum filtro ativo para esta coluna
        }
        const rowValue = row[header] ? normalizeForComparison(row[header]) : '';
        return activeFilters[header].some(filterValue => normalizeForComparison(filterValue) === rowValue);
      });
    });

    // 3. Ordenação
    if (sortConfig.key) {
      currentData.sort((a, b) => {
        const aValue = a[sortConfig.key] || '';
        const bValue = b[sortConfig.key] || '';

        // Tratamento especial para 'Data Limite'
        if (sortConfig.key === 'Data Limite') {
          const dateA = new Date(aValue.split('/').reverse().join('-'));
          const dateB = new Date(bValue.split('/').reverse().join('-'));
          if (isNaN(dateA.getTime())) return sortConfig.direction === 'ascending' ? 1 : -1;
          if (isNaN(dateB.getTime())) return sortConfig.direction === 'ascending' ? -1 : 1;
          return sortConfig.direction === 'ascending' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        }

        // Ordenação padrão para strings
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'ascending'
            ? aValue.localeCompare(bValue, 'pt-BR', { sensitivity: 'base' })
            : bValue.localeCompare(aValue, 'pt-BR', { sensitivity: 'base' });
        }

        // Fallback para outros tipos ou valores nulos
        if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }

    return currentData;
  }, [data, activeFilters, sortConfig, tableHeaders, normalizeForComparison, allowedStatuses]);


  // Atualiza filteredData sempre que processedData muda
  useEffect(() => {
    setFilteredData(processedData);
  }, [processedData]);


  // Função para lidar com o upload do arquivo
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setLoading(true);
    setError(null);
    setData([]); // Limpa dados anteriores
    setFilteredData([]); // Limpa dados filtrados anteriores
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
      setData(response.data);
      // Inicializa filterSelections com todas as opções únicas para cada coluna
      const initialFilterSelections = {};
      tableHeaders.forEach(header => {
        const uniqueValues = [...new Set(response.data.map(row => row[header] || ''))]
          .filter(value => value !== null && value !== undefined)
          .sort((a, b) => normalizeForComparison(a).localeCompare(normalizeForComparison(b), 'pt-BR', { sensitivity: 'base' }));
        initialFilterSelections[header] = uniqueValues.map(value => ({ value, checked: true }));
      });
      setFilterSelections(initialFilterSelections);

    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      setError('Erro ao carregar o arquivo. Verifique o formato e tente novamente.');
      setData([]); // Garante que os dados sejam limpos em caso de erro
    } finally {
      setLoading(false);
    }
  };

  // Função para alternar o dropdown de filtro
  const toggleFilterDropdown = useCallback((header) => {
    setOpenDropdown(prev => {
      if (prev === header) {
        return null;
      } else {
        // Calcula a posição do dropdown
        const iconRect = filterIconRefs.current[header]?.getBoundingClientRect();
        if (iconRect) {
          setFilterDropdownPosition({
            top: iconRect.bottom + window.scrollY + 5, // 5px abaixo do ícone
            left: iconRect.left + window.scrollX,
          });
        }
        return header;
      }
    });
  }, []);

  // Função para lidar com a seleção de opções de filtro
  const handleFilterOptionChange = useCallback((header, value, isChecked) => {
    setFilterSelections(prev => {
      const newSelections = { ...prev };
      if (newSelections[header]) {
        newSelections[header] = newSelections[header].map(option =>
          option.value === value ? { ...option, checked: isChecked } : option
        );
      }
      return newSelections;
    });
  }, []);

  // Função para aplicar os filtros
  const applyFilters = useCallback((header) => {
    setActiveFilters(prev => {
      const newActiveFilters = { ...prev };
      const selectedOptions = filterSelections[header]
        .filter(option => option.checked)
        .map(option => option.value);
      newActiveFilters[header] = selectedOptions;
      return newActiveFilters;
    });
    setOpenDropdown(null); // Fecha o dropdown após aplicar
  }, [filterSelections]);

  // Função para limpar os filtros de uma coluna
  const clearFilters = useCallback((header) => {
    setActiveFilters(prev => {
      const newActiveFilters = { ...prev };
      delete newActiveFilters[header];
      return newActiveFilters;
    });
    setFilterSelections(prev => {
      const newSelections = { ...prev };
      if (newSelections[header]) {
        newSelections[header] = newSelections[header].map(option => ({ ...option, checked: true }));
      }
      return newSelections;
    });
    setOpenDropdown(null); // Fecha o dropdown após limpar
  }, []);

  // Função para alternar a ordenação
  const requestSort = useCallback((key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  // Função para exportar para Excel
  const exportToExcel = useCallback(() => {
    // Filtra apenas os itens pendentes de hoje (atrasados e vencendo hoje)
    const pendingTodayData = data.filter(row => {
      const { isOverdue, isDueToday } = isOverdueOrDueToday(row['Data Limite']);
      return isOverdue || isDueToday;
    });

    if (pendingTodayData.length === 0) {
      alert('Não há itens pendentes para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(pendingTodayData);

    // Aplica estilos de cor de fundo às células no Excel
    pendingTodayData.forEach((row, rowIndex) => {
      const rowClass = getRowClassByDataLimite(row);
      let bgColor = 'FFFFFF'; // Branco padrão

      if (rowClass === 'overdue-strong') {
        bgColor = 'FF0000'; // Vermelho intenso
      } else if (rowClass === 'due-today') {
        bgColor = 'FFFF00'; // Amarelo
      } else if (rowClass === 'falta-abonar') {
        // Se for "falta-abonar" e não for atrasado ou vencendo hoje, usa roxo.
        // Mas a lógica atual de getRowClassByDataLimite já prioriza overdue-strong,
        // então 'falta-abonar' só será aplicado se não for overdue/due-today.
        // No entanto, para exportação, queremos que "FALTA ABONAR" atrasado seja vermelho.
        // A lógica de getRowClassByDataLimite já cuida disso.
        // Então, se chegar aqui como 'falta-abonar', significa que não é atrasado nem hoje,
        // mas a regra de exportação é "apenas pendentes de hoje", então esta linha não deveria estar aqui.
        // Para garantir, vamos usar a cor do 'overdue-strong' para "FALTA ABONAR" se for atrasado.
        // A lógica de `getRowClassByDataLimite` já está priorizando o vermelho para atrasados.
        // Então, se a linha for 'falta-abonar' (roxo), ela não será atrasada nem vencendo hoje.
        // E, portanto, não deveria ser incluída na exportação de "pendentes de hoje".
        // No entanto, se houver um "FALTA ABONAR" que *também* é atrasado, ele já será vermelho.
        // Para ser explícito, se a linha for "FALTA ABONAR" E atrasada, queremos vermelho.
        // Se for "FALTA ABONAR" e não atrasada/hoje, não entra na exportação.
        // Então, a cor roxa não deve aparecer na exportação de "pendentes de hoje".
        // A cor será definida pelo `getRowClassByDataLimite` que já prioriza vermelho/amarelo.
        // Se a linha é 'falta-abonar' e não é 'overdue-strong' ou 'due-today', ela não será exportada.
        // Portanto, apenas vermelho e amarelo são relevantes para a exportação.
      }

      // Aplica a cor de fundo à linha inteira
      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex }); // +1 para cabeçalho
        if (!ws[cellRef]) ws[cellRef] = { v: '' }; // Garante que a célula exista
        ws[cellRef].s = {
          fill: { fgColor: { rgb: bgColor } },
          font: { color: { rgb: (bgColor === 'FF0000' || bgColor === '800080') ? 'FFFFFF' : '000000' } }, // Texto branco para vermelho/roxo, preto para amarelo
          alignment: { vertical: 'center', horizontal: 'left' },
          border: {
            top: { style: 'thin', color: { auto: 1 } },
            bottom: { style: 'thin', color: { auto: 1 } },
            left: { style: 'thin', color: { auto: 1 } },
            right: { style: 'thin', color: { auto: 1 } },
          },
        };
      });
    });

    // Ajusta a largura das colunas
    const wscols = tableHeaders.map(header => ({
      wch: Math.max(...pendingTodayData.map(row => (row[header] ? String(row[header]).length : 0)), header.length) + 2
    }));
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes Hoje');
    XLSX.writeFile(wb, 'Pendentes_Hoje.xlsx');
  }, [data, isOverdueOrDueToday, getRowClassByDataLimite, tableHeaders]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Dashboard de Ordens de Serviço</h1>
        <div className="action-bar">
          <div className="file-upload-container">
            <label htmlFor="file-upload" className="custom-file-upload">
              <FontAwesomeIcon icon={faFileUpload} />
              {selectedFileName ? selectedFileName : 'Carregar CSV'}
            </label>
            <input id="file-upload" type="file" accept=".csv" onChange={handleFileUpload} />
            {selectedFileName && <span className="file-name-display">{selectedFileName}</span>}
          </div>

          <div className="action-buttons">
            <button onClick={exportToExcel} className="export-button" disabled={filteredData.length === 0}>
              <FontAwesomeIcon icon={faFileExcel} />
              Exportar Pendentes Hoje
            </button>
            {overdueCount > 0 && (
              <div className="overdue-count">
                <span className="count-number">{overdueCount}</span> Ordens em Atraso
              </div>
            )}
          </div>
        </div>
        {loading && <p>Carregando...</p>}
        {error && <p className="error-message">{error}</p>}
      </header>

      <main className="App-main">
        {filteredData.length > 0 && (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  {tableHeaders.map(header => (
                    <th key={header} className={`col-${header.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
                      <div className="header-content">
                        <span className="sortable-header" onClick={() => requestSort(header)}>
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
                          onClick={() => toggleFilterDropdown(header)}
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
                            {filterSelections[header] && filterSelections[header].map(option => (
                              <label key={option.value} className="filter-option">
                                <input
                                  type="checkbox"
                                  checked={option.checked}
                                  onChange={(e) => handleFilterOptionChange(header, option.value, e.target.checked)}
                                />
                                {option.value === '' ? '(Vazio)' : option.value}
                              </label>
                            ))}
                          </div>
                          <div className="filter-actions">
                            <button onClick={() => applyFilters(header)}>Aplicar</button>
                            <button onClick={() => clearFilters(header)}>Limpar</button>
                          </div>
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, index) => (
                  <tr key={index} className={getRowClassByDataLimite(row)}>
                    {tableHeaders.map(header => (
                      <td key={header} className={
                        (header === 'Justificativa do Abono' && row['Justificativa do Abono'] && row['Justificativa do Abono'].toUpperCase().trim() === 'FALTA ABONAR')
                          ? 'falta-abonar'
                          : ''
                      }>
                        {header === 'Data Limite' ? formatDataLimite(row[header]) : row[header]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filteredData.length === 0 && !loading && !error && data.length > 0 && (
          <p className="no-data-message">Nenhum dado corresponde aos filtros aplicados.</p>
        )}
        {data.length === 0 && !loading && !error && (
          <p className="no-data-message">Faça o upload de um arquivo CSV para começar.</p>
        )}
      </main>
    </div>
  );
}

export default App;
