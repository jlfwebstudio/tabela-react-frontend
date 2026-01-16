// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx-js-style';
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

  const normalizeStatusValue = useCallback((status) => {
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

  // Função para formatar CNPJ/CPF (agora o backend já remove "=""")
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

  // Efeito para calcular o contador de OSs em atraso
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

    const count = filteredData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      if (!dataLimiteStr) return false;

      try {
        const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (parts) {
          const [, day, month, year] = parts;
          const dataLimite = new Date(`${month}/${day}/${year}`); // Formato MM/DD/YYYY para Date
          dataLimite.setHours(0, 0, 0, 0);

          const justificativa = String(row['Justificativa do Abono']).trim();

          // Atrasado se Data Limite < hoje E Justificativa do Abono está vazia
          return dataLimite < today && justificativa === '';
        }
      } catch (e) {
        console.error("Erro ao comparar data limite para contador:", dataLimiteStr, e);
      }
      return false;
    }).length;
    setOverdueCount(count);
  }, [filteredData]); // Depende de filteredData

  // Efeito para fechar o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target) &&
        !Object.values(filterIconRefs.current).some(ref => ref && ref.contains(event.target))) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Função para lidar com o upload do arquivo CSV
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setLoading(true);
    setError(null);
    setData([]);
    setFilteredData([]);
    setOverdueCount(0);
    setActiveFilters({});
    setFilterSelections({});
    setOpenDropdown(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.post(`${backendUrl}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      console.log('--- DADOS BRUTOS RECEBIDOS DO BACKEND ---');
      console.log(response.data.slice(0, 5)); // Log das primeiras 5 linhas para depuração
      setData(response.data);
      setFilteredData(response.data); // Inicializa filteredData com todos os dados
    } catch (err) {
      console.error('Erro ao carregar o arquivo:', err);
      setError('Erro ao carregar o arquivo. Verifique o formato ou tente novamente.');
      setData([]);
      setFilteredData([]);
    } finally {
      setLoading(false);
    }
  };

  // Função para obter valores únicos de uma coluna para o filtro
  const getUniqueColumnValues = useCallback((header) => {
    const values = new Set();
    data.forEach(row => {
      let value = row[header];
      if (header === 'Status') {
        value = normalizeStatusValue(value);
        if (!allowedStatuses.includes(value)) {
          return; // Ignora status não permitidos no filtro
        }
      }
      values.add(value === '' ? '' : value); // Adiciona string vazia para valores nulos/vazios
    });
    const sortedValues = Array.from(values).sort((a, b) => {
      if (a === '') return 1; // Coloca vazio no final
      if (b === '') return -1; // Coloca vazio no final
      return String(a).localeCompare(String(b));
    });
    return sortedValues;
  }, [data, allowedStatuses, normalizeStatusValue]);

  // Função para alternar o dropdown de filtro
  const toggleFilterDropdown = useCallback((header, event) => {
    setOpenDropdown(prev => (prev === header ? null : header));
    if (openDropdown !== header) { // Se está abrindo um novo dropdown
      const iconRect = event.currentTarget.getBoundingClientRect();
      // Posição do dropdown acima do ícone, alinhado à esquerda
      setFilterDropdownPosition({
        top: iconRect.top - 10, // 10px acima do ícone
        left: iconRect.left,
      });
      // Inicializa as seleções de filtro para o novo dropdown
      setFilterSelections(prev => {
        const currentActive = activeFilters[header] || {};
        const uniqueValues = getUniqueColumnValues(header);
        const newSelections = {};
        uniqueValues.forEach(value => {
          newSelections[value] = currentActive[value] !== undefined ? currentActive[value] : true; // Seleciona tudo por padrão
        });
        return newSelections;
      });
    }
  }, [openDropdown, activeFilters, getUniqueColumnValues]);

  // Função para lidar com a mudança de seleção no filtro
  const handleFilterSelectionChange = useCallback((value) => {
    setFilterSelections(prev => ({
      ...prev,
      [openDropdown]: {
        ...prev[openDropdown],
        [value]: !prev[openDropdown][value]
      }
    }));
  }, [openDropdown]);

  // Função para selecionar/desmarcar tudo no filtro
  const toggleSelectAll = useCallback((header, selectAll) => {
    setFilterSelections(prev => {
      const newSelections = {};
      getUniqueColumnValues(header).forEach(value => {
        newSelections[value] = selectAll;
      });
      return newSelections;
    });
  }, [getUniqueColumnValues]);

  // Função para aplicar os filtros
  const applyFilters = useCallback((header) => {
    setActiveFilters(prev => ({ ...prev, [header]: filterSelections[header] }));
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
      const newFilterSelections = { ...prev };
      delete newFilterSelections[header];
      return newFilterSelections;
    });
    setOpenDropdown(null);
  }, []);

  // Efeito para aplicar todos os filtros ativos e ordenação
  useEffect(() => {
    let currentFilteredData = [...data];

    // Aplica filtros
    Object.keys(activeFilters).forEach(header => {
      const selectedValues = Object.keys(activeFilters[header]).filter(key => activeFilters[header][key]);
      if (selectedValues.length > 0 && selectedValues.length < getUniqueColumnValues(header).length) {
        currentFilteredData = currentFilteredData.filter(row => {
          let rowValue = row[header];
          if (header === 'Status') {
            rowValue = normalizeStatusValue(rowValue);
          }
          return selectedValues.includes(rowValue === '' ? '' : rowValue);
        });
      }
    });

    // Filtra por status permitidos (sempre ativo)
    currentFilteredData = currentFilteredData.filter(row => {
      const status = normalizeStatusValue(row['Status']);
      return allowedStatuses.includes(status);
    });

    // Aplica ordenação
    if (sortConfig.key) {
      currentFilteredData.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        // Lógica de ordenação para Data Limite
        if (sortConfig.key === 'Data Limite') {
          const dateA = aValue ? new Date(aValue.replace(/(\d{2})\/(\d{2})\/(\d{4})(.*)/, '$2/$1/$3$4')) : null;
          const dateB = bValue ? new Date(bValue.replace(/(\d{2})\/(\d{2})\/(\d{4})(.*)/, '$2/$1/$3$4')) : null;

          if (dateA === null && dateB === null) return 0;
          if (dateA === null) return sortConfig.direction === 'ascending' ? 1 : -1;
          if (dateB === null) return sortConfig.direction === 'ascending' ? -1 : 1;

          return sortConfig.direction === 'ascending' ? dateA - dateB : dateB - dateA;
        }

        // Ordenação padrão para outros tipos
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'ascending'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        }
        if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }

    setFilteredData(currentFilteredData);
  }, [data, activeFilters, sortConfig, allowedStatuses, getUniqueColumnValues, normalizeStatusValue]);


  // Função para lidar com a ordenação da tabela
  const requestSort = useCallback((key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  // Função para determinar a classe CSS da linha com base na Data Limite
  const getRowClassByDataLimite = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    if (!dataLimiteStr) return '';

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (parts) {
        const [, day, month, year] = parts;
        const dataLimite = new Date(`${month}/${day}/${year}`);
        dataLimite.setHours(0, 0, 0, 0);

        const justificativa = String(row['Justificativa do Abono']).trim();

        // Verifica se a OS está atrasada
        if (dataLimite < today) {
          // Se a justificativa está vazia, a célula será "FALTA ABONAR"
          // Neste caso, queremos o vermelho normal para o restante da linha
          if (justificativa === '') {
            return 'overdue-normal'; // Vermelho mais claro para a linha
          }
          // Se tem justificativa (não é "FALTA ABONAR"), também queremos o vermelho normal
          return 'overdue-normal'; // Vermelho mais claro para a linha
        } else if (dataLimite.getTime() === today.getTime()) {
          return 'due-today'; // Amarelo se for hoje
        }
      }
    } catch (e) {
      console.error("Erro ao determinar classe da linha:", dataLimiteStr, e);
    }
    return '';
  }, []);

  // Função para obter o conteúdo da célula e a classe CSS
  const getCellContentAndClassName = useCallback((row, header) => {
    let content = row[header];
    let className = '';

    if (header === 'Data Limite') {
      content = formatDataLimite(content);
    } else if (header === 'CNPJ / CPF') {
      content = formatCnpjCpf(content);
    } else if (header === 'Status') {
      content = normalizeStatusValue(content);
    } else if (header === 'Justificativa do Abono') {
      const dataLimiteStr = row['Data Limite'];
      const justificativa = String(content).trim();

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let isOverdueAndUnjustified = false;
      if (dataLimiteStr) {
        try {
          const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (parts) {
            const [, day, month, year] = parts;
            const dataLimite = new Date(`${month}/${day}/${year}`);
            dataLimite.setHours(0, 0, 0, 0);
            isOverdueAndUnjustified = (dataLimite < today && justificativa === '');
          }
        } catch (e) {
          console.error("Erro ao verificar justificativa para célula:", dataLimiteStr, e);
        }
      }

      if (isOverdueAndUnjustified) {
        content = 'FALTA ABONAR';
        className = 'falta-abonar';
      } else if (justificativa === '') {
        content = ''; // Garante que células vazias não mostrem "FALTA ABONAR" se não estiverem atrasadas
      }
    }

    // Adiciona classes de largura para colunas específicas
    if (header === 'Numero Referencia') className += ' col-numero-referencia';
    if (header === 'CNPJ / CPF') className += ' col-cnpj-cpf';
    if (header === 'Cidade') className += ' col-cidade';
    if (header === 'Serviço') className += ' col-servico';
    if (header === 'Técnico') className += ' col-tecnico';
    if (header === 'Justificativa do Abono') className += ' col-justificativa';


    return { content, className: className.trim() };
  }, [formatDataLimite, formatCnpjCpf, normalizeStatusValue]);

  // Função para exportar para Excel
  const exportToExcel = useCallback(() => {
    if (filteredData.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }

    const ws_data = [tableHeaders.map(header => ({ v: header, t: 's' }))]; // Cabeçalhos

    filteredData.forEach(row => {
      const excelRow = [];
      tableHeaders.forEach(header => {
        const { content, className } = getCellContentAndClassName(row, header);
        let cellValue = content;
        let cellType = 's'; // Default to string

        // Determine cell type for Excel
        if (header === 'Data Limite' && content) {
          // Convert DD/MM/YYYY to Excel date number
          const parts = content.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (parts) {
            const [, day, month, year] = parts;
            const date = new Date(year, month - 1, day);
            cellValue = date; // Excel will format this as a date
            cellType = 'd';
          }
        } else if (header === 'CNPJ / CPF' && content) {
          // Keep CNPJ/CPF as string to preserve formatting
          cellType = 's';
        } else if (typeof content === 'number') {
          cellType = 'n';
        }

        const cell = { v: cellValue, t: cellType };

        // Apply styles based on className
        let bgColor = null;
        let textColor = null;
        let fontWeight = null;

        if (className.includes('overdue-strong')) {
          bgColor = 'FF0000'; // Red
          textColor = 'FFFFFF'; // White
        } else if (className.includes('due-today')) {
          bgColor = 'FFFF00'; // Yellow
          textColor = '000000'; // Black
        } else if (className.includes('falta-abonar')) {
          bgColor = '800080'; // Purple
          textColor = 'FFFFFF'; // White
          fontWeight = 'bold';
        }

        if (bgColor || textColor || fontWeight) {
          cell.s = {
            fill: { fgColor: { rgb: bgColor } },
            font: { color: { rgb: textColor }, bold: fontWeight === 'bold' },
            alignment: { vertical: 'center', horizontal: 'left' },
            border: {
              top: { style: 'thin', color: { rgb: 'DDDDDD' } },
              bottom: { style: 'thin', color: { rgb: 'DDDDDD' } },
              left: { style: 'thin', color: { rgb: 'DDDDDD' } },
              right: { style: 'thin', color: { rgb: 'DDDDDD' } },
            },
          };
        }

        excelRow.push(cell);
      });
      ws_data.push(excelRow);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Apply header styles
    const headerStyle = {
      fill: { fgColor: { rgb: 'F2F2F2' } },
      font: { bold: true, color: { rgb: '333333' } },
      alignment: { vertical: 'center', horizontal: 'left' },
      border: {
        top: { style: 'thin', color: { rgb: 'DDDDDD' } },
        bottom: { style: 'thin', color: { rgb: 'DDDDDD' } },
        left: { style: 'thin', color: { rgb: 'DDDDDD' } },
        right: { style: 'thin', color: { rgb: 'DDDDDD' } },
      },
    };
    for (let C = 0; C < tableHeaders.length; ++C) {
      const cellref = XLSX.utils.encode_cell({ c: C, r: 0 });
      if (!ws[cellref]) ws[cellref] = {};
      ws[cellref].s = headerStyle;
    }

    // Set column widths (approximate)
    const wscols = [
      { wch: 12 }, // Chamado
      { wch: 15 }, // Numero Referencia
      { wch: 25 }, // Contratante
      { wch: 20 }, // Serviço
      { wch: 15 }, // Status
      { wch: 15 }, // Data Limite
      { wch: 30 }, // Cliente
      { wch: 20 }, // CNPJ / CPF
      { wch: 15 }, // Cidade
      { wch: 20 }, // Técnico
      { wch: 25 }, // Prestador
      { wch: 30 }, // Justificativa do Abono
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dados');
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(dataBlob, 'tabela_os.xlsx');
  }, [filteredData, tableHeaders, getCellContentAndClassName]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Dashboard de Ordens de Serviço</h1>
        <div className="action-buttons">
          <label htmlFor="file-upload" className="custom-file-upload">
            <FontAwesomeIcon icon={faFileUpload} /> {selectedFileName ? selectedFileName : 'Carregar CSV'}
          </label>
          <input id="file-upload" type="file" accept=".csv" onChange={handleFileUpload} />
          {data.length > 0 && (
            <button onClick={exportToExcel} className="export-button">
              <FontAwesomeIcon icon={faFileExcel} /> Exportar para Excel
            </button>
          )}
          {overdueCount > 0 && (
            <div className="overdue-count">
              OSs em Atraso (Não Abonadas): {overdueCount}
            </div>
          )}
        </div>
      </header>

      {loading && <div className="loading-message">Carregando...</div>}
      {error && <div className="error-message">{error}</div>}

      {data.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map((header) => (
                  <th key={header}>
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
                        className={`filter-icon ${activeFilters[header] && Object.values(activeFilters[header]).some(Boolean) ? 'filter-active' : ''}`}
                        onClick={(event) => toggleFilterDropdown(header, event)}
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
                          {getUniqueColumnValues(header).map(value => (
                            <label key={value} className="filter-option">
                              <input
                                type="checkbox"
                                checked={filterSelections[value] || false}
                                onChange={() => handleFilterSelectionChange(value)}
                              />
                              {value === '' ? '(Vazio)' : value}
                            </label>
                          ))}
                        </div>
                        <div className="filter-actions">
                          <button onClick={() => toggleSelectAll(header, true)}>Selecionar Tudo</button>
                          <button onClick={() => toggleSelectAll(header, false)}>Desmarcar Tudo</button>
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
              {filteredData.map((row, rowIndex) => (
                <tr key={rowIndex} className={getRowClassByDataLimite(row)}>
                  {tableHeaders.map((header) => {
                    const { content, className } = getCellContentAndClassName(row, header);
                    return (
                      <td key={header} className={className}>
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
