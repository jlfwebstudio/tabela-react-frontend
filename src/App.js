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
  const sortedItems = useMemo(() => {
    let sortableItems = [...filteredData];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Tratamento especial para 'Data Limite'
        if (sortConfig.key === 'Data Limite') {
          aValue = new Date(aValue);
          bValue = new Date(bValue);
          // Lida com datas inválidas para evitar NaN
          if (isNaN(aValue.getTime())) aValue = new Date(0); // Coloca no início
          if (isNaN(bValue.getTime())) bValue = new Date(0); // Coloca no início
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
          aValue = normalizeForComparison(aValue);
          bValue = normalizeForComparison(bValue);
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredData, sortConfig, normalizeForComparison]);

  // Retorna o ícone de ordenação
  const getSortIcon = useCallback((key) => {
    if (!sortConfig.key || sortConfig.key !== key) {
      return null;
    }
    return sortConfig.direction === 'ascending' ? faSortUp : faSortDown;
  }, [sortConfig]);

  // Lógica de filtro
  const getUniqueColumnValues = useCallback((columnName) => {
    const values = new Set();
    data.forEach(row => {
      let value = row[columnName];
      if (columnName === 'Status') {
        value = normalizeStatusValue(value);
      }
      if (value === null || value === undefined || String(value).trim() === '') {
        values.add(''); // Adiciona uma string vazia para representar valores nulos/vazios
      } else {
        values.add(String(value).trim());
      }
    });
    return Array.from(values).sort((a, b) => {
      if (a === '') return -1; // Coloca vazio no início
      if (b === '') return 1;
      return a.localeCompare(b);
    });
  }, [data, normalizeStatusValue]);

  const toggleFilterDropdown = useCallback((header, e) => {
    e.stopPropagation(); // Impede que o clique se propague e feche o dropdown imediatamente
    if (openDropdown === header) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(header);
      // Inicializa as seleções do filtro com base nos filtros ativos ou todos marcados
      const currentActiveFilters = activeFilters[header] || {};
      const uniqueValues = getUniqueColumnValues(header);
      const initialSelections = {};
      if (Object.keys(currentActiveFilters).length > 0) {
        // Se já houver filtros ativos, usa-os
        uniqueValues.forEach(val => {
          initialSelections[val] = currentActiveFilters[val] || false;
        });
      } else {
        // Caso contrário, marca todos por padrão
        uniqueValues.forEach(val => {
          initialSelections[val] = true;
        });
      }
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
    uniqueValues.forEach(val => {
      newSelections[val] = selectAll;
    });
    setFilterSelections(newSelections);
  }, [getUniqueColumnValues]);

  // Efeito para fechar o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        // Verifica se o clique não foi no ícone de filtro que abriu o dropdown
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
  }, [openDropdown]); // Adiciona openDropdown como dependência para re-executar o efeito quando o dropdown abre/fecha

  // Efeito para aplicar os filtros quando activeFilters muda
  useEffect(() => {
    let currentFilteredData = [...data];

    Object.keys(activeFilters).forEach(columnName => {
      const selectedValues = Object.keys(activeFilters[columnName]).filter(key => activeFilters[columnName][key]);

      if (selectedValues.length > 0) {
        currentFilteredData = currentFilteredData.filter(row => {
          let rowValue = row[columnName];
          if (columnName === 'Status') {
            rowValue = normalizeStatusValue(rowValue);
          }
          const normalizedRowValue = (rowValue === null || rowValue === undefined || String(rowValue).trim() === '') ? '' : String(rowValue).trim();
          return selectedValues.includes(normalizedRowValue);
        });
      }
    });
    setFilteredData(currentFilteredData);
  }, [data, activeFilters, normalizeStatusValue]);


  // Função para exportar para Excel
  const exportToExcel = useCallback(() => {
    if (filteredData.length === 0) {
      alert("Não há dados para exportar.");
      return;
    }

    const ws_data = [
      tableHeaders, // Cabeçalhos
      ...filteredData.map(row => tableHeaders.map(header => {
        // AQUI ESTÁ A CORREÇÃO: Não desestruturamos 'content'
        const { className } = getCellContentAndClassName(row, header);
        let cellValue = row[header];

        // Aplica a mesma lógica de formatação da tabela para o Excel
        if (header === 'CNPJ / CPF') {
          cellValue = formatCnpjCpf(cellValue);
        } else if (header === 'Data Limite') {
          cellValue = formatDataLimite(cellValue);
        } else if (header === 'Status') {
          cellValue = normalizeStatusValue(cellValue);
        } else if (header === 'Justificativa do Abono') {
          const dataLimiteStr = row['Data Limite'];
          const justificativa = row['Justificativa do Abono'];
          if (dataLimiteStr) {
            const dataLimite = new Date(dataLimiteStr);
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            dataLimite.setHours(0, 0, 0, 0);
            if (dataLimite < hoje && (!justificativa || justificativa.trim() === '')) {
              cellValue = 'FALTA ABONAR';
            }
          }
        }
        return cellValue;
      }))
    ];

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Aplica estilos aos cabeçalhos
    tableHeaders.forEach((header, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "4A4A6A" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: { rgb: "5A5A7A" } },
          bottom: { style: "thin", color: { rgb: "5A5A7A" } },
          left: { style: "thin", color: { rgb: "5A5A7A" } },
          right: { style: "thin", color: { rgb: "5A5A7A" } },
        },
      };
    });

    // Aplica estilos às células de dados
    filteredData.forEach((row, rowIndex) => {
      const rowClass = getRowClassByDataLimite(row);
      const baseFillColor = (rowIndex % 2 === 0) ? "2A2A4A" : "20203A"; // Cores de fundo alternadas

      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
        if (!ws[cellRef]) ws[cellRef] = {};

        let fillColor = baseFillColor;
        let fontColor = "FFFFFF"; // Cor padrão do texto

        // Aplica a cor da linha
        if (rowClass === 'overdue-row-strong') {
          fillColor = "CC0000"; // Vermelho forte
        } else if (rowClass === 'overdue-row') {
          fillColor = "FF6666"; // Vermelho normal
          fontColor = "333333"; // Texto escuro para contraste
        } else if (rowClass === 'due-today-row') {
          fillColor = "FFFF99"; // Amarelo
          fontColor = "333333"; // Texto escuro para contraste
        }

        // Sobrescreve a cor da célula "FALTA ABONAR"
        const { className: cellClassName } = getCellContentAndClassName(row, header); // Pega a classe da célula
        if (cellClassName.includes('falta-abonar')) {
          fillColor = "800080"; // Roxo
          fontColor = "FFFFFF"; // Texto branco
        }

        ws[cellRef].s = {
          font: { color: { rgb: fontColor } },
          fill: { fgColor: { rgb: fillColor } },
          alignment: { horizontal: "left", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "5A5A7A" } },
            bottom: { style: "thin", color: { rgb: "5A5A7A" } },
            left: { style: "thin", color: { rgb: "5A5A7A" } },
            right: { style: "thin", color: { rgb: "5A5A7A" } },
          },
        };
      });
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
  }, [filteredData, tableHeaders, getCellContentAndClassName, getRowClassByDataLimite, formatCnpjCpf, formatDataLimite, normalizeStatusValue]);


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
