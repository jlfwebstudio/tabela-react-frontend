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
    if (typeof str !== 'string') return ''; // Retorna string vazia para evitar erros
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  }, []);

  // eslint-disable-next-line no-unused-vars
  const normalizeStatusValue = useCallback((status) => {
    if (typeof status !== 'string') return ''; // Retorna string vazia para evitar erros
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
      const date = new Date(dateString);
      if (isNaN(date.getTime())) { // Verifica se a data é inválida
        // Tenta parsear formatos comuns como DD/MM/AAAA ou DD-MM-AAAA
        const parts = dateString.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
        if (parts) {
          const d = new Date(`${parts[3]}-${parts[2]}-${parts[1]}T00:00:00`);
          if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR');
        }
        return dateString; // Retorna a string original se não conseguir formatar
      }
      return date.toLocaleDateString('pt-BR');
    } catch (e) {
      console.error("Erro ao formatar data:", dateString, e);
      return dateString;
    }
  }, []);

  // Função para verificar se uma data está atrasada ou vence hoje
  const isOverdueOrDueToday = useCallback((dateString) => {
    if (!dateString) return { isOverdue: false, isDueToday: false };
    try {
      let date = new Date(dateString);
      if (isNaN(date.getTime())) {
        const parts = dateString.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
        if (parts) {
          date = new Date(`${parts[3]}-${parts[2]}-${parts[1]}T00:00:00`);
        } else {
          return { isOverdue: false, isDueToday: false };
        }
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      date.setHours(0, 0, 0, 0);

      const isOverdue = date < today;
      const isDueToday = date.getTime() === today.getTime();

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

  // Efeito para aplicar filtros e ordenação sempre que 'data' ou 'activeFilters' mudarem
  useEffect(() => {
    let currentFilteredData = [...data];

    // Aplica o filtro de status permanente
    currentFilteredData = currentFilteredData.filter(row => {
      const status = row['Status'] ? normalizeForComparison(row['Status']) : '';
      return allowedStatuses.some(allowed => normalizeForComparison(allowed).includes(status));
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
      const { isOverdue } = isOverdueOrDueToday(row['Data Limite']);
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
          const dateA = aValue ? new Date(aValue) : new Date(0);
          const dateB = bValue ? new Date(bValue) : new Date(0);
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
    if (!file) {
      setError('Nenhum arquivo selecionado.');
      return;
    }

    setSelectedFileName(file.name);
    setLoading(true);
    setError(null);
    setData([]); // Limpa os dados anteriores
    setFilteredData([]); // Limpa os dados filtrados anteriores
    setActiveFilters({}); // Limpa filtros ativos
    setFilterSelections({}); // Limpa seleções de filtro

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      // Verifica se a resposta contém dados e se é um array
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        setData(response.data);
      } else {
        setError('O arquivo CSV foi processado, mas nenhum dado válido foi encontrado.');
        setData([]);
      }
    } catch (err) {
      console.error('Erro ao fazer upload do arquivo:', err);
      setError('Erro ao fazer upload do arquivo. Verifique o console para mais detalhes.');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterClick = (column, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setFilterDropdownPosition({
      top: rect.bottom + window.scrollY + 5,
      left: rect.left + window.scrollX,
    });

    // Popula as opções de filtro com base nos dados atuais
    const uniqueOptions = [...new Set(data.map(item => item[column]).filter(Boolean))].sort((a, b) => {
      if (typeof a === 'string' && typeof b === 'string') {
        return a.localeCompare(b);
      }
      return 0;
    });
    setFilterSelections(prev => ({
      ...prev,
      [column]: uniqueOptions.map(option => ({
        value: option,
        checked: activeFilters[column] ? activeFilters[column].includes(normalizeForComparison(option)) : true
      }))
    }));
    setOpenDropdown(column);
  };

  const handleFilterOptionChange = (column, optionValue) => {
    setFilterSelections(prev => ({
      ...prev,
      [column]: prev[column].map(option =>
        option.value === optionValue ? { ...option, checked: !option.checked } : option
      )
    }));
  };

  const applyFilter = (column) => {
    const selected = filterSelections[column]
      .filter(option => option.checked)
      .map(option => normalizeForComparison(option.value));
    setActiveFilters(prev => ({
      ...prev,
      [column]: selected
    }));
    setOpenDropdown(null);
  };

  const clearFilter = (column) => {
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[column];
      return newFilters;
    });
    setFilterSelections(prev => ({
      ...prev,
      [column]: prev[column].map(option => ({ ...option, checked: true }))
    }));
    setOpenDropdown(null);
  };

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) {
      return null;
    }
    return sortConfig.direction === 'ascending' ? faSortUp : faSortDown;
  };

  const getRowClass = useCallback((row) => {
    const { isOverdue, isDueToday } = isOverdueOrDueToday(row['Data Limite']);
    const justificativa = row['Justificativa do Abono'] ? row['Justificativa do Abono'].trim() : '';

    if (isOverdue) {
      // Se atrasado e justificativa vazia, é "FALTA ABONAR"
      if (!justificativa) {
        return 'overdue-strong'; // Vermelho forte para atrasados sem justificativa
      }
      return 'overdue-strong'; // Vermelho forte para atrasados com justificativa
    }
    if (isDueToday) {
      return 'due-today'; // Amarelo para vencendo hoje
    }
    return ''; // Nenhuma classe para outros casos
  }, [isOverdueOrDueToday]);

  const getCellClass = useCallback((row, header) => {
    const { isOverdue } = isOverdueOrDueToday(row['Data Limite']);
    const justificativa = row['Justificativa do Abono'] ? row['Justificativa do Abono'].trim() : '';

    if (header === 'Justificativa do Abono' && isOverdue && !justificativa) {
      return 'falta-abonar';
    }
    return '';
  }, [isOverdueOrDueToday]);


  const exportToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dataToExport = filteredData.filter(row => {
      const { isOverdue, isDueToday } = isOverdueOrDueToday(row['Data Limite']);
      return isOverdue || isDueToday;
    });

    if (dataToExport.length === 0) {
      alert('Não há itens pendentes para hoje ou atrasados para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);

    // Aplicar estilos
    dataToExport.forEach((row, rowIndex) => {
      const { isOverdue, isDueToday } = isOverdueOrDueToday(row['Data Limite']);
      const justificativa = row['Justificativa do Abono'] ? row['Justificativa do Abono'].trim() : '';

      const cellStyle = {};
      if (isOverdue) {
        cellStyle.fill = { fgColor: { rgb: "FF0000" } }; // Vermelho forte
        cellStyle.font = { color: { rgb: "FFFFFF" } }; // Texto branco
      } else if (isDueToday) {
        cellStyle.fill = { fgColor: { rgb: "FFFF00" } }; // Amarelo
        cellStyle.font = { color: { rgb: "333333" } }; // Texto escuro
      }

      // Aplicar estilo para "FALTA ABONAR" se for o caso
      if (isOverdue && !justificativa) {
        // Se a linha já é vermelha, a célula "FALTA ABONAR" também será vermelha com texto branco
        // Não aplicamos roxo aqui para manter a consistência com a linha vermelha forte
        // Se a intenção for roxo para a célula mesmo em linha vermelha, ajustar aqui.
        // Por enquanto, segue a cor da linha (vermelho forte)
      }

      // Aplicar o estilo a todas as células da linha
      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex }); // +1 para pular o cabeçalho
        if (!ws[cellRef]) ws[cellRef] = {};
        ws[cellRef].s = cellStyle;
      });
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

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendentes Hoje");
    XLSX.writeFile(wb, "Ordens_Pendentes_Hoje.xlsx");
  }, [filteredData, isOverdueOrDueToday, tableHeaders]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de Ordens de Serviço</h1>
        <div className="file-upload-container">
          <label htmlFor="file-upload" className="custom-file-upload">
            <FontAwesomeIcon icon={faFileUpload} /> {selectedFileName ? 'Trocar Arquivo' : 'Upload CSV'}
          </label>
          <input id="file-upload" type="file" accept=".csv" onChange={handleFileUpload} />
          {selectedFileName && <span className="file-name-display">{selectedFileName}</span>}
        </div>
        <div className="action-buttons">
          <button onClick={exportToExcel} className="export-button" disabled={filteredData.length === 0}>
            <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes Hoje
          </button>
          <div className="overdue-count">
            Ordens de Serviço em Atraso: <span className="count-number">{overdueCount}</span>
          </div>
        </div>
      </header>

      <main className="data-table-container">
        {loading && <p className="loading-message">Carregando dados...</p>}
        {error && <p className="error-message">{error}</p>}

        {!loading && !error && filteredData.length > 0 ? (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  {tableHeaders.map((header) => (
                    <th key={header} className={`col-${normalizeForComparison(header).toLowerCase().replace(/ /g, '-')}`}>
                      <div className="header-content">
                        <span className="sortable-header" onClick={() => requestSort(header)}>
                          {header}
                          <FontAwesomeIcon icon={getSortIcon(header)} className="sort-icon" />
                        </span>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${activeFilters[header] && activeFilters[header].length > 0 ? 'filter-active' : ''}`}
                          onClick={(e) => handleFilterClick(header, e)}
                          ref={el => filterIconRefs.current[header] = el}
                        />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, rowIndex) => (
                  <tr key={rowIndex} className={getRowClass(row)}>
                    {tableHeaders.map((header, colIndex) => (
                      <td key={colIndex} className={getCellClass(row, header)}>
                        {header === 'Data Limite' ? formatDataLimite(row[header]) : row[header]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && !error && (
            <p className="no-data-message">
              {data.length === 0 ? 'Faça o upload de um arquivo CSV para começar.' : 'Nenhum dado corresponde aos filtros aplicados.'}
            </p>
          )
        )}

        {openDropdown && (
          <div
            className="filter-dropdown"
            ref={filterDropdownRef}
            style={{ top: filterDropdownPosition.top, left: filterDropdownPosition.left }}
          >
            <div className="filter-options-container">
              {filterSelections[openDropdown] && filterSelections[openDropdown].map((option, index) => (
                <div key={index} className="filter-option">
                  <input
                    type="checkbox"
                    id={`filter-${openDropdown}-${index}`}
                    checked={option.checked}
                    onChange={() => handleFilterOptionChange(openDropdown, option.value)}
                  />
                  <label htmlFor={`filter-${openDropdown}-${index}`}>{option.value}</label>
                </div>
              ))}
            </div>
            <div className="filter-actions">
              <button onClick={() => applyFilter(openDropdown)}>Aplicar</button>
              <button onClick={() => clearFilter(openDropdown)}>Limpar</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
