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

    const count = filteredData.filter(row => { // <-- filteredData é usado aqui
      const dataLimiteStr = row['Data Limite'];
      const justificativa = row['Justificativa do Abono'];

      if (!dataLimiteStr) return false;

      const dataLimite = new Date(dataLimiteStr);
      dataLimite.setHours(0, 0, 0, 0);

      // Conta apenas se a data limite for menor que hoje E a justificativa estiver vazia
      return dataLimite < hoje && (!justificativa || justificativa.trim() === '');
    }).length;
    setOverdueCount(count);
  }, [filteredData]); // <-- Adicionado filteredData ao array de dependências

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
  }, [sortConfig, filteredData]); // filteredData também é uma dependência aqui para reordenar quando os filtros mudam

  // Retorna o ícone de ordenação
  const getSortIcon = useCallback((header) => {
    if (sortConfig.key !== header) {
      return null;
    }
    return sortConfig.direction === 'ascending' ? faSortUp : faSortDown;
  }, [sortConfig]);

  // Lógica de filtro
  const getUniqueColumnValues = useCallback((header) => {
    const values = new Set();
    data.forEach(row => {
      let value = row[header];
      if (header === 'Status') {
        value = normalizeStatusValue(value);
      } else if (header === 'Data Limite') {
        value = formatDataLimite(value);
      }
      values.add(value === null || value === undefined || String(value).trim() === '' ? '' : value);
    });
    // Ordena os valores únicos, colocando o vazio por último
    return Array.from(values).sort((a, b) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [data, normalizeStatusValue, formatDataLimite]);

  // Abre/fecha o dropdown de filtro
  const toggleFilterDropdown = useCallback((header, event) => {
    setOpenDropdown(prev => {
      if (prev === header) {
        return null;
      } else {
        // Inicializa as seleções de filtro para o novo dropdown
        const currentActiveFilters = activeFilters[header] || {};
        const initialSelections = {};
        getUniqueColumnValues(header).forEach(value => {
          initialSelections[value] = currentActiveFilters[value] !== undefined ? currentActiveFilters[value] : true;
        });
        setFilterSelections(initialSelections);

        // Posiciona o dropdown
        const iconRect = filterIconRefs.current[header].getBoundingClientRect();
        setFilterDropdownPosition({
          top: iconRect.bottom + window.scrollY + 5, // 5px abaixo do ícone
          left: iconRect.left + window.scrollX,
        });
        return header;
      }
    });
  }, [activeFilters, getUniqueColumnValues]);

  // Handler para mudança de seleção no filtro
  const handleFilterSelectionChange = useCallback((value) => {
    setFilterSelections(prev => ({
      ...prev,
      [value]: !prev[value]
    }));
  }, []);

  // Aplica os filtros
  const applyFilters = useCallback((header) => {
    setActiveFilters(prev => ({
      ...prev,
      [header]: filterSelections
    }));
    setOpenDropdown(null); // Fecha o dropdown após aplicar
  }, [filterSelections]);

  // Limpa os filtros de uma coluna
  const clearFilters = useCallback((header) => {
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[header];
      return newFilters;
    });
    setFilterSelections({}); // Limpa as seleções temporárias
    setOpenDropdown(null); // Fecha o dropdown
  }, []);

  // Seleciona/desseleciona todos os filtros de uma coluna
  const toggleSelectAll = useCallback((header, selectAll) => {
    const newSelections = {};
    getUniqueColumnValues(header).forEach(value => {
      newSelections[value] = selectAll;
    });
    setFilterSelections(newSelections);
  }, [getUniqueColumnValues]);

  // Efeito para aplicar os filtros globais
  useEffect(() => {
    let currentFilteredData = [...data];

    Object.keys(activeFilters).forEach(header => {
      const selectedValues = Object.keys(activeFilters[header]).filter(key => activeFilters[header][key]);
      if (selectedValues.length > 0) {
        currentFilteredData = currentFilteredData.filter(row => {
          let rowValue = row[header];
          if (header === 'Status') {
            rowValue = normalizeStatusValue(rowValue);
          } else if (header === 'Data Limite') {
            rowValue = formatDataLimite(rowValue);
          }
          return selectedValues.includes(rowValue === null || rowValue === undefined || String(rowValue).trim() === '' ? '' : rowValue);
        });
      }
    });
    setFilteredData(currentFilteredData);
  }, [data, activeFilters, normalizeStatusValue, formatDataLimite]);

  // Fecha o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        // Verifica se o clique não foi em nenhum ícone de filtro
        let clickedOnFilterIcon = false;
        for (const header in filterIconRefs.current) {
          if (filterIconRefs.current[header] && filterIconRefs.current[header].contains(event.target)) {
            clickedOnFilterIcon = true;
            break;
          }
        }
        if (!clickedOnFilterIcon) {
          setOpenDropdown(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []); // Sem dependências, executa uma vez na montagem

  // Função para exportar para Excel
  const exportToExcel = useCallback(() => {
    if (filteredData.length === 0) {
      alert("Não há dados para exportar.");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(filteredData.map(row => {
      const newRow = {};
      tableHeaders.forEach(header => {
        const { content } = getCellContentAndClassName(row, header);
        newRow[header] = content;
      });
      return newRow;
    }));

    // Aplica estilos às células
    filteredData.forEach((row, rowIndex) => {
      const rowClass = getRowClassByDataLimite(row);
      const excelRowIndex = rowIndex + 2; // +1 para 1-based, +1 para o cabeçalho

      tableHeaders.forEach((header, colIndex) => {
        const cellAddress = XLSX.utils.encode_cell({ r: excelRowIndex - 1, c: colIndex });
        const cell = ws[cellAddress];

        if (!cell) return;

        // Estilo padrão para células
        cell.s = {
          fill: { fgColor: { rgb: "FFFFFF" } }, // Fundo branco padrão
          font: { color: { rgb: "000000" } }, // Texto preto padrão
          alignment: { vertical: "center", horizontal: "left" },
          border: {
            top: { style: "thin", color: { rgb: "E0E0E0" } },
            bottom: { style: "thin", color: { rgb: "E0E0E0" } },
            left: { style: "thin", color: { rgb: "E0E0E0" } },
            right: { style: "thin", color: { rgb: "E0E0E0" } },
          },
        };

        // Aplica cor de fundo da linha
        if (rowClass === 'overdue-row-strong') {
          cell.s.fill = { fgColor: { rgb: "CC0000" } }; // Vermelho forte
          cell.s.font = { color: { rgb: "FFFFFF" } }; // Texto branco
        } else if (rowClass === 'overdue-row') {
          cell.s.fill = { fgColor: { rgb: "FF6666" } }; // Vermelho normal
          cell.s.font = { color: { rgb: "333333" } }; // Texto cinza escuro
        } else if (rowClass === 'due-today-row') {
          cell.s.fill = { fgColor: { rgb: "FFFF99" } }; // Amarelo
          cell.s.font = { color: { rgb: "333333" } }; // Texto cinza escuro
        } else if (rowIndex % 2 === 0) { // Linhas pares (índice 0, 2, 4...)
          cell.s.fill = { fgColor: { rgb: "EFEFEF" } }; // Cinza claro para linhas pares
        } else { // Linhas ímpares
          cell.s.fill = { fgColor: { rgb: "FFFFFF" } }; // Branco para linhas ímpares
        }

        // Sobrescreve a cor da célula "FALTA ABONAR"
        const { content, className } = getCellContentAndClassName(row, header);
        if (className.includes('falta-abonar')) {
          cell.s.fill = { fgColor: { rgb: "800080" } }; // Roxo
          cell.s.font = { color: { rgb: "FFFFFF" }, bold: true }; // Texto branco e negrito
        }
      });
    });

    // Estilos para o cabeçalho
    tableHeaders.forEach((header, colIndex) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      const cell = ws[cellAddress];
      if (cell) {
        cell.s = {
          fill: { fgColor: { rgb: "4A4A6A" } }, // Cor de fundo dos cabeçalhos
          font: { color: { rgb: "FFFFFF" }, bold: true }, // Texto branco e negrito
          alignment: { vertical: "center", horizontal: "left" },
          border: {
            top: { style: "thin", color: { rgb: "5A5A7A" } },
            bottom: { style: "thin", color: { rgb: "5A5A7A" } },
            left: { style: "thin", color: { rgb: "5A5A7A" } },
            right: { style: "thin", color: { rgb: "5A5A7A" } },
          },
        };
      }
    });

    // Ajusta a largura das colunas
    const wscols = tableHeaders.map(header => {
      let minWidth = 10; // Largura mínima padrão
      if (header === 'Chamado') minWidth = 12;
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
