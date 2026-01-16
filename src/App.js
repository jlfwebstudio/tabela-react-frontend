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
  const [activeFilters, setActiveFilters] = useState({}); // Filtros atualmente aplicados {columnName: {value1: true, value2: false}}
  const [filterSelections, setFilterSelections] = useState({}); // Seleções temporárias no dropdown
  const [openDropdown, setOpenDropdown] = useState(null);
  const filterDropdownRef = useRef(null);
  const filterIconRefs = useRef({});
  const [filterDropdownPosition, setFilterDropdownPosition] = useState({ top: 0, left: 0 });
  const [overdueCount, setOverdueCount] = useState(0); // Contador de OSs em atraso (Data Limite < hoje)
  const [sortConfig, setSortConfig] = useState({ key: 'Data Limite', direction: 'ascending' });
  const [selectedFileName, setSelectedFileName] = useState('');

  // Define os cabeçalhos da tabela na ordem desejada
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
    // 'Origem' // REMOVIDA A COLUNA ORIGEM
  ], []);

  // Status permitidos para exibição e filtro
  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO'
  ], []);

  // Função para normalizar strings para comparação (maiúsculas, sem acentos, trim)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return str;
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  }, []);

  // Função para normalizar valores de status específicos
  const normalizeStatusValue = useCallback((status) => {
    const normalized = normalizeForComparison(status);
    if (normalized.includes('ENCAMINHADA')) return 'ENCAMINHADA';
    if (normalized.includes('EM TRANSFERENCIA')) return 'EM TRANSFERÊNCIA';
    if (normalized.includes('EM CAMPO')) return 'EM CAMPO';
    if (normalized.includes('REENCAMINHADO')) return 'REENCAMINHADO';
    if (normalized.includes('PROCEDIMENTO TECNICO')) return 'PROCEDIMENTO TÉCNICO';
    return status; // Retorna o original se não houver normalização específica
  }, [normalizeForComparison]);

  // Função para formatar CNPJ/CPF
  const formatCnpjCpf = useCallback((value) => {
    if (!value) return '';
    const cleaned = String(value).replace(/\D/g, ''); // Remove tudo que não é dígito
    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); // CPF
    } else if (cleaned.length === 14) {
      return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'); // CNPJ
    }
    return value; // Retorna o valor original se não for CPF nem CNPJ
  }, []);

  // Função para formatar a Data Limite
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        // Tenta parsear formatos comuns se new Date falhar
        const parts = dateString.match(/(\d{2})[./-](\d{2})[./-](\d{4})/);
        if (parts) {
          const d = new Date(`${parts[3]}-${parts[2]}-${parts[1]}`);
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

  // Função para determinar a classe da linha com base na Data Limite e Justificativa
  const getRowClassByDataLimite = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];

    if (!dataLimiteStr) return '';

    const dataLimite = new Date(dataLimiteStr);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0); // Zera a hora para comparação apenas da data

    dataLimite.setHours(0, 0, 0, 0); // Zera a hora da data limite também

    if (dataLimite < hoje) {
      // Atrasado
      if (!justificativa || justificativa.trim() === '') {
        return 'overdue-row-strong'; // Vermelho forte para atrasado sem abono
      } else {
        return 'overdue-row'; // Vermelho normal para atrasado com abono
      }
    } else if (dataLimite.getTime() === hoje.getTime()) {
      // Vencendo hoje
      return 'due-today-row'; // Amarelo sutil
    }
    return '';
  }, []);

  // Função para obter o conteúdo e a classe da célula
  const getCellContentAndClassName = useCallback((row, header) => {
    let content = row[header];
    let className = '';

    if (header === 'CNPJ / CPF') {
      content = formatCnpjCpf(content);
    } else if (header === 'Data Limite') {
      content = formatDataLimite(content);
    } else if (header === 'Status') {
      content = normalizeStatusValue(content);
    } else if (header === 'Justificativa do Abono') {
      const dataLimiteStr = row['Data Limite'];
      const justificativa = row['Justificativa do Abono'];

      if (dataLimiteStr) {
        const dataLimite = new Date(dataLimiteStr);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        dataLimite.setHours(0, 0, 0, 0);

        if (dataLimite < hoje && (!justificativa || justificativa.trim() === '')) {
          content = 'FALTA ABONAR';
          className = 'falta-abonar'; // Classe para a célula roxa
        }
      }
    }

    // Adiciona a classe para células vazias ou com conteúdo específico para estilização
    if (content === null || content === undefined || String(content).trim() === '') {
      className += ' empty-cell'; // Adiciona uma classe para células vazias se precisar de estilo
    }

    return { content, className };
  }, [formatCnpjCpf, formatDataLimite, normalizeStatusValue]);


  // Efeito para calcular o contador de OSs em atraso
  useEffect(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const count = filteredData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      const justificativa = row['Justificativa do Abono'];

      if (!dataLimiteStr) return false;

      const dataLimite = new Date(dataLimiteStr);
      dataLimite.setHours(0, 0, 0, 0);

      // Conta apenas se a data limite for menor que hoje E a justificativa estiver vazia
      return dataLimite < hoje && (!justificativa || justificativa.trim() === '');
    }).length;
    setOverdueCount(count);
  }, [filteredData]); // Depende de filteredData para recalcular quando os dados mudam

  // Função para buscar os dados do backend
  const fetchData = useCallback(async (file) => {
    setLoading(true);
    setError(null);
    setData([]);
    setFilteredData([]);
    setOverdueCount(0); // Reseta o contador ao iniciar novo upload

    const formData = new FormData();
    formData.append('file', file); // O nome do campo deve ser 'file' para corresponder ao Multer no backend

    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.post(`${backendUrl}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const rawData = response.data;

      // Filtra os dados com base nos allowedStatuses
      const processedAndFilteredData = rawData.filter(row => {
        const status = normalizeStatusValue(row['Status']);
        return allowedStatuses.includes(status);
      });

      setData(processedAndFilteredData);
      setFilteredData(processedAndFilteredData); // Inicialmente, filteredData é igual a data
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar o arquivo:', err);
      setError('Erro ao carregar o arquivo. Verifique o formato e tente novamente.');
      setData([]);
      setFilteredData([]);
    } finally {
      setLoading(false);
    }
  }, [allowedStatuses, normalizeStatusValue]); // Dependências para useCallback

  // Handler para o upload de arquivo
  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFileName(file.name);
      fetchData(file);
    } else {
      setSelectedFileName('');
      setData([]);
      setFilteredData([]);
      setError(null);
    }
  }, [fetchData]);

  // Lógica de ordenação da tabela
  const requestSort = useCallback((key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  // Aplica a ordenação aos dados filtrados
  useEffect(() => {
    if (sortConfig.key) {
      const sorted = [...filteredData].sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        // Lógica de ordenação específica para 'Data Limite'
        if (sortConfig.key === 'Data Limite') {
          const dateA = aValue ? new Date(aValue) : new Date(0); // Usa data mínima para valores vazios
          const dateB = bValue ? new Date(bValue) : new Date(0);
          if (dateA < dateB) return sortConfig.direction === 'ascending' ? -1 : 1;
          if (dateA > dateB) return sortConfig.direction === 'ascending' ? 1 : -1;
          return 0;
        }

        // Ordenação padrão para outros tipos de dados
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'ascending'
            ? aValue.localeCompare(bValue, undefined, { numeric: true, sensitivity: 'base' })
            : bValue.localeCompare(aValue, undefined, { numeric: true, sensitivity: 'base' });
        }

        if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
      setFilteredData(sorted);
    }
  }, [sortConfig, data]); // Depende de 'data' para reordenar quando novos dados chegam

  // Ícone de ordenação
  const getSortIcon = useCallback((key) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === 'ascending' ? faSortUp : faSortDown;
  }, [sortConfig]);

  // Lógica de filtro
  const getUniqueColumnValues = useCallback((columnName) => {
    const values = new Set();
    data.forEach(row => {
      let value = row[columnName];
      if (columnName === 'Status') {
        value = normalizeStatusValue(value);
      } else if (columnName === 'Data Limite') {
        value = formatDataLimite(value);
      } else if (columnName === 'CNPJ / CPF') {
        value = formatCnpjCpf(value);
      }
      values.add(value || ''); // Adiciona valor ou string vazia para representar nulos/vazios
    });
    return Array.from(values).sort((a, b) => {
      if (a === '') return -1; // Vazios primeiro
      if (b === '') return 1;
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [data, normalizeStatusValue, formatDataLimite, formatCnpjCpf]);

  const toggleFilterDropdown = useCallback((header, event) => {
    event.stopPropagation(); // Impede que o clique se propague e feche o dropdown imediatamente
    setOpenDropdown(prev => (prev === header ? null : header));

    if (openDropdown !== header) {
      // Se abrindo um novo dropdown, inicializa as seleções
      const uniqueValues = getUniqueColumnValues(header);
      const currentActive = activeFilters[header] || {};
      const initialSelections = {};
      uniqueValues.forEach(value => {
        initialSelections[value] = currentActive[value] !== undefined ? currentActive[value] : true;
      });
      setFilterSelections(initialSelections);

      // Posiciona o dropdown
      const iconRect = filterIconRefs.current[header].getBoundingClientRect();
      setFilterDropdownPosition({
        top: iconRect.bottom + window.scrollY + 5, // 5px abaixo do ícone
        left: iconRect.left + window.scrollX,
      });
    }
  }, [openDropdown, activeFilters, getUniqueColumnValues]);

  const handleFilterSelectionChange = useCallback((value) => {
    setFilterSelections(prev => ({
      ...prev,
      [value]: !prev[value]
    }));
  }, []);

  const applyFilters = useCallback((header) => {
    setActiveFilters(prev => ({
      ...prev,
      [header]: filterSelections
    }));
    setOpenDropdown(null); // Fecha o dropdown após aplicar
  }, [filterSelections]);

  const clearFilters = useCallback((header) => {
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[header]; // Remove o filtro para esta coluna
      return newFilters;
    });
    setFilterSelections({}); // Limpa as seleções temporárias
    setOpenDropdown(null); // Fecha o dropdown
  }, []);

  const toggleSelectAll = useCallback((header, selectAll) => {
    const uniqueValues = getUniqueColumnValues(header);
    const newSelections = {};
    uniqueValues.forEach(value => {
      newSelections[value] = selectAll;
    });
    setFilterSelections(newSelections);
  }, [getUniqueColumnValues]);

  // Efeito para fechar o dropdown ao clicar fora
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

  // Aplica os filtros aos dados brutos
  useEffect(() => {
    let currentFilteredData = [...data];

    Object.keys(activeFilters).forEach(columnName => {
      const selectedValues = Object.keys(activeFilters[columnName]).filter(key => activeFilters[columnName][key]);
      if (selectedValues.length > 0) {
        currentFilteredData = currentFilteredData.filter(row => {
          let rowValue = row[columnName];
          if (columnName === 'Status') {
            rowValue = normalizeStatusValue(rowValue);
          } else if (columnName === 'Data Limite') {
            rowValue = formatDataLimite(rowValue);
          } else if (columnName === 'CNPJ / CPF') {
            rowValue = formatCnpjCpf(rowValue);
          }
          return selectedValues.includes(rowValue || '');
        });
      }
    });
    setFilteredData(currentFilteredData);
  }, [data, activeFilters, normalizeStatusValue, formatDataLimite, formatCnpjCpf]);

  // Exportar para Excel com estilos
  const exportToExcel = useCallback(() => {
    if (filteredData.length === 0) return;

    const ws = XLSX.utils.json_to_sheet([]); // Cria uma planilha vazia

    // Adiciona os cabeçalhos com estilo
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } }, // Texto branco e negrito
      fill: { fgColor: { rgb: "4A4A6A" } }, // Fundo azul acinzentado
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "3A3A5A" } },
        bottom: { style: "thin", color: { rgb: "3A3A5A" } },
        left: { style: "thin", color: { rgb: "3A3A5A" } },
        right: { style: "thin", color: { rgb: "3A3A5A" } },
      }
    };

    tableHeaders.forEach((header, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      ws[cellRef] = { v: header, t: 's', s: headerStyle };
    });

    // Adiciona os dados com estilos de linha e célula
    filteredData.forEach((row, rowIndex) => {
      const rowClass = getRowClassByDataLimite(row);
      let rowBgColor = { rgb: "2A2A4A" }; // Cor padrão para linhas pares
      let rowTextColor = { rgb: "FFFFFF" }; // Cor padrão do texto

      if (rowIndex % 2 === 0) {
        rowBgColor = { rgb: "2A2A4A" }; // Fundo alternado para linhas pares
      } else {
        rowBgColor = { rgb: "20203A" }; // Fundo alternado para linhas ímpares
      }

      if (rowClass === 'overdue-row-strong') {
        rowBgColor = { rgb: "CC0000" }; // Vermelho forte
        rowTextColor = { rgb: "FFFFFF" };
      } else if (rowClass === 'overdue-row') {
        rowBgColor = { rgb: "FF6666" }; // Vermelho normal
        rowTextColor = { rgb: "333333" };
      } else if (rowClass === 'due-today-row') {
        rowBgColor = { rgb: "FFFF99" }; // Amarelo sutil
        rowTextColor = { rgb: "333333" };
      }

      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
        const { content, className } = getCellContentAndClassName(row, header);

        let cellStyle = {
          font: { color: rowTextColor },
          fill: { fgColor: rowBgColor },
          alignment: { horizontal: "left", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "3A3A5A" } },
            bottom: { style: "thin", color: { rgb: "3A3A5A" } },
            left: { style: "thin", color: { rgb: "3A3A5A" } },
            right: { style: "thin", color: { rgb: "3A3A5A" } },
          }
        };

        // Sobrescreve o estilo da célula se for "FALTA ABONAR"
        if (className.includes('falta-abonar')) { // Usa includes para verificar se a classe está presente
          cellStyle.font = { bold: true, color: { rgb: "FFFFFF" } }; // Texto branco
          cellStyle.fill = { fgColor: { rgb: "800080" } }; // Roxo
        }

        ws[cellRef] = { v: content, t: 's', s: cellStyle }; // Aplica o estilo à célula
      });
    });

    // Ajusta a largura das colunas
    const wscols = tableHeaders.map(header => {
      let minWidth = 10; // Largura mínima padrão
      if (header === 'Serviço') minWidth = 25;
      if (header === 'Contratante') minWidth = 18;
      if (header === 'Status') minWidth = 18;
      if (header === 'Justificativa do Abono') minWidth = 30;
      if (header === 'Técnico') minWidth = 20;
      if (header === 'Prestador') minWidth = 25;
      if (header === 'Cidade') minWidth = 15;
      if (header === 'CNPJ / CPF') minWidth = 18;
      if (header === 'Numero Referencia') minWidth = 15;
      if (header === 'Data Limite') minWidth = 15;

      const contentWidth = Math.max(...filteredData.map(row => String(row[header] || '').length));

      return {
        wch: Math.max(minWidth, contentWidth) + 2
      };
    });
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório de OSs");
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(dataBlob, 'relatorio_oss.xlsx');
  }, [filteredData, tableHeaders, getCellContentAndClassName, getRowClassByDataLimite]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Relatório de Ordens de Serviço</h1>
      </header>

      <div className="controls-container">
        <div className="file-upload-section">
          <label htmlFor="file-upload" className="custom-file-upload">
            <FontAwesomeIcon icon={faFileUpload} /> Carregar CSV
          </label>
          <input id="file-upload" type="file" accept=".csv" onChange={handleFileUpload} />
          {selectedFileName && <span className="file-name-display">Arquivo: {selectedFileName}</span>}
        </div>

        <div className="info-actions-container">
          <div className="overdue-count">
            OSs em Atraso: <span className="count-number">{overdueCount}</span>
          </div>
          <button onClick={exportToExcel} className="export-button" disabled={filteredData.length === 0}>
            <FontAwesomeIcon icon={faFileExcel} /> Exportar para Excel
          </button>
        </div>
      </div>

      {loading && <div className="loading-message">Carregando dados...</div>}
      {error && <div className="error-message">{error}</div>}

      {!loading && !error && filteredData.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map((header) => (
                  <th key={header}>
                    <div className="header-content">
                      <span onClick={() => requestSort(header)} className="sortable-header">
                        {header}
                        {getSortIcon(header) && <FontAwesomeIcon icon={getSortIcon(header)} className="sort-icon" />}
                      </span>
                      <FontAwesomeIcon
                        icon={faFilter}
                        className={`filter-icon ${activeFilters[header] && Object.values(activeFilters[header]).some(Boolean) ? 'filter-active' : ''}`}
                        onClick={(e) => toggleFilterDropdown(header, e)}
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
