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
    'Justificativa do Abono'
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
    if (typeof status !== 'string') return status;
    let normalized = status.trim().toUpperCase();
    if (normalized.includes('OS ENCAMINHADA')) return 'ENCAMINHADA';
    if (normalized.includes('EM CAMPO')) return 'EM CAMPO';
    if (normalized.includes('REENCAMINHADO')) return 'REENCAMINHADO';
    if (normalized.includes('PROCEDIMENTO TECNICO')) return 'PROCEDIMENTO TÉCNICO';
    if (normalized.includes('EM TRANSFERENCIA')) return 'EM TRANSFERÊNCIA';
    return normalized;
  }, []);

  // Função para normalizar datas para comparação (apenas DD/MM/AAAA)
  const normalizeDate = useCallback((dateString) => {
    if (!dateString) return null;
    const parts = dateString.split(' ')[0].split('/');
    if (parts.length === 3) {
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
    return null;
  }, []);

  // Função auxiliar para verificar se a justificativa está vazia ou é "FALTA ABONAR"
  const isJustificativaVazia = useCallback((justificativa) => {
    const normalizedJustificativa = normalizeForComparison(justificativa);
    return !normalizedJustificativa || normalizedJustificativa === 'FALTA ABONAR';
  }, [normalizeForComparison]);

  // Efeito para aplicar filtros e ordenação
  useEffect(() => {
    let currentFilteredData = [...data];

    currentFilteredData = currentFilteredData.filter(row => {
      const normalizedStatus = normalizeStatusValue(row['Status']);
      return allowedStatuses.includes(normalizedStatus);
    });

    Object.keys(activeFilters).forEach(columnName => {
      const selectedValues = activeFilters[columnName];
      const hasActiveSelection = Object.values(selectedValues).some(Boolean);
      if (hasActiveSelection) {
        currentFilteredData = currentFilteredData.filter(row => {
          const cellValue = row[columnName];
          const normalizedCellValue = normalizeForComparison(cellValue);
          return Object.keys(selectedValues).some(filterValue =>
            selectedValues[filterValue] && normalizeForComparison(filterValue) === normalizedCellValue
          );
        });
      }
    });

    if (sortConfig.key) {
      currentFilteredData.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (sortConfig.key === 'Data Limite') {
          const dateA = normalizeDate(aValue);
          const dateB = normalizeDate(bValue);

          if (dateA && dateB) {
            return sortConfig.direction === 'ascending' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
          }
          return 0;
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'ascending' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortConfig.direction === 'ascending' ? aValue - bValue : bValue - aValue;
        }
        return 0;
      });
    }

    setFilteredData(currentFilteredData);
  }, [data, activeFilters, sortConfig, normalizeForComparison, normalizeStatusValue, normalizeDate, allowedStatuses]);

  // Efeito para calcular o contador de OSs em atraso (Data Limite < hoje)
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let count = 0;
    filteredData.forEach(row => {
      const dataLimiteStr = row['Data Limite'];
      const dataLimite = normalizeDate(dataLimiteStr);
      // O contador agora contabiliza TODOS os chamados com data limite < hoje
      if (dataLimite && dataLimite.getTime() < today.getTime()) {
        count++;
      }
    });
    setOverdueCount(count);
  }, [filteredData, normalizeDate]); // Removido isJustificativaVazia daqui, conforme nova lógica

  // Função para lidar com o upload do arquivo
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      setError("Nenhum arquivo selecionado.");
      return;
    }

    setSelectedFileName(file.name);
    setLoading(true);
    setError(null);
    setData([]); // Limpa os dados anteriores

    const formData = new FormData();
    formData.append('csvFile', file);

    try {
      // Usando a variável de ambiente para a URL da API
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:10000';
      const response = await axios.post(`${apiUrl}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setData(response.data);
      setLoading(false);
      // Limpa os filtros ativos e seleções após um novo upload
      setActiveFilters({});
      setFilterSelections({});
      setOpenDropdown(null);
    } catch (err) {
      console.error("Erro ao fazer upload do arquivo:", err);
      setError("Erro ao carregar o arquivo. Verifique o formato e tente novamente.");
      setLoading(false);
    }
  };

  // Função para obter valores únicos de uma coluna para o filtro
  const getUniqueColumnValues = useCallback((columnName) => {
    const values = new Set();
    filteredData.forEach(row => {
      const value = row[columnName];
      // Normaliza o status para o filtro, se for a coluna 'Status'
      if (columnName === 'Status') {
        values.add(normalizeStatusValue(value));
      } else {
        values.add(value === undefined || value === null ? '' : String(value));
      }
    });
    const sortedValues = Array.from(values).sort((a, b) => {
      if (a === '') return 1; // Coloca vazios no final
      if (b === '') return -1;
      return String(a).localeCompare(String(b));
    });
    return sortedValues;
  }, [filteredData, normalizeStatusValue]);

  // Lógica para abrir/fechar dropdown de filtro
  const toggleFilterDropdown = useCallback((columnName, event) => {
    event.stopPropagation(); // Impede que o clique feche o dropdown imediatamente
    if (openDropdown === columnName) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(columnName);
      // Inicializa as seleções do filtro com base nos filtros ativos
      setFilterSelections(activeFilters[columnName] || {});

      // Calcula a posição do dropdown
      const iconRect = filterIconRefs.current[columnName].getBoundingClientRect();
      // Posiciona o dropdown acima da tabela, alinhado com o ícone
      setFilterDropdownPosition({
        top: iconRect.bottom + window.scrollY + 5, // 5px abaixo do ícone
        left: iconRect.left + window.scrollX
      });
    }
  }, [openDropdown, activeFilters]);

  // Lógica para fechar dropdown ao clicar fora
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
  }, [filterDropdownRef, filterIconRefs]);

  // Lógica para lidar com a seleção de filtros
  const handleFilterSelectionChange = useCallback((value) => {
    setFilterSelections(prev => ({
      ...prev,
      [value]: !prev[value]
    }));
  }, []);

  // Lógica para aplicar filtros
  const applyFilters = useCallback((columnName) => {
    setActiveFilters(prev => ({
      ...prev,
      [columnName]: filterSelections
    }));
    setOpenDropdown(null);
  }, [filterSelections]);

  // Lógica para limpar filtros
  const clearFilters = useCallback((columnName) => {
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[columnName];
      return newFilters;
    });
    setFilterSelections({});
    setOpenDropdown(null);
  }, []);

  // Lógica para selecionar/desmarcar tudo no filtro
  const toggleSelectAll = useCallback((columnName, selectAll) => {
    const uniqueValues = getUniqueColumnValues(columnName);
    const newSelections = {};
    uniqueValues.forEach(value => {
      newSelections[value] = selectAll;
    });
    setFilterSelections(newSelections);
  }, [getUniqueColumnValues]);

  // Lógica de ordenação
  const requestSort = useCallback((key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  // Ícone de ordenação
  const getSortIcon = useCallback((key) => {
    if (!sortConfig.key || sortConfig.key !== key) {
      return null;
    }
    return sortConfig.direction === 'ascending' ? faSortUp : faSortDown;
  }, [sortConfig]);

  // Função para determinar a classe da linha com base na Data Limite (AGORA SEM CONSIDERAR JUSTIFICATIVA PARA A COR DA LINHA)
  const getRowClassByDataLimite = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const dataLimite = normalizeDate(dataLimiteStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dataLimite) {
      // Data Limite < Data de Hoje (SEMPRE VERMELHO se atrasado)
      if (dataLimite.getTime() < today.getTime()) {
        // Usamos overdue-row-strong para todos os atrasados, a célula FALTA ABONAR terá prioridade de cor
        return 'overdue-row-strong';
      }
      // Data Limite = Data de Hoje
      if (dataLimite.getTime() === today.getTime()) {
        return 'due-today-row';
      }
    }
    return '';
  }, [normalizeDate]); // Removido isJustificativaVazia daqui, conforme nova lógica

  // Função para obter o conteúdo e a classe da célula
  const getCellContentAndClassName = useCallback((row, header) => {
    let content = row[header];
    let className = '';

    // Formatação específica para CNPJ / CPF
    if (header === 'CNPJ / CPF') {
      if (typeof content === 'string') {
        content = content.replace(/^=?"?|"?$/g, ''); // Remove =, " do início e fim
      }
    }

    // Lógica para a célula "Justificativa do Abono"
    if (header === 'Justificativa do Abono') {
      const dataLimiteStr = row['Data Limite'];
      const dataLimite = normalizeDate(dataLimiteStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Se a data limite passou E a justificativa estiver vazia, exibe "FALTA ABONAR" e aplica a classe roxa
      if (dataLimite && dataLimite.getTime() < today.getTime() && isJustificativaVazia(content)) {
        content = 'FALTA ABONAR';
        className = 'falta-abonar';
      }
    }

    return { content, className };
  }, [normalizeDate, isJustificativaVazia]);


  // Função para exportar para Excel
  const exportToExcel = useCallback(() => {
    if (filteredData.length === 0) {
      alert("Não há dados para exportar.");
      return;
    }

    // Mapeia os dados para o formato esperado pelo XLSX, aplicando as mesmas transformações visuais
    const dataForExport = filteredData.map(row => {
      const newRow = {};
      tableHeaders.forEach(header => {
        const { content } = getCellContentAndClassName(row, header);
        newRow[header] = content;
      });
      return newRow;
    });

    // Cria a planilha com os dados e cabeçalhos
    const ws = XLSX.utils.json_to_sheet(dataForExport, { header: tableHeaders });

    // Estilo para o cabeçalho
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "4A4A6A" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "6A6A8A" } },
        bottom: { style: "thin", color: { rgb: "6A6A8A" } },
        left: { style: "thin", color: { rgb: "6A6A8A" } },
        right: { style: "thin", color: { rgb: "6A6A8A" } },
      }
    };

    tableHeaders.forEach((header, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = headerStyle;
    });

    // Aplica estilos às células de dados
    filteredData.forEach((row, rowIndex) => {
      const rowClass = getRowClassByDataLimite(row); // Obtém a classe da linha
      let rowBgColor = "2A2A4A"; // Cor de fundo padrão da linha
      let rowFontColor = "E0E0E0"; // Cor da fonte padrão da linha

      // Determina a cor de fundo da linha
      if (rowClass === 'overdue-row-strong') {
        rowBgColor = "CC0000"; // Vermelho forte
        rowFontColor = "FFFFFF"; // Texto branco
      } else if (rowClass === 'overdue-row') {
        rowBgColor = "FF6666"; // Vermelho normal
        rowFontColor = "333333"; // Texto escuro
      } else if (rowClass === 'due-today-row') {
        rowBgColor = "FFFF99"; // Amarelo sutil
        rowFontColor = "333333"; // Texto escuro
      }

      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
        if (!ws[cellRef]) ws[cellRef] = {};

        const { content, className } = getCellContentAndClassName(row, header); // Obtém o conteúdo formatado e a classe

        // Estilo da célula
        let cellStyle = {
          font: { color: { rgb: rowFontColor } },
          fill: { fgColor: { rgb: rowBgColor } },
          alignment: { vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "3A3A5A" } },
            bottom: { style: "thin", color: { rgb: "3A3A5A" } },
            left: { style: "thin", color: { rgb: "3A3A5A" } },
            right: { style: "thin", color: { rgb: "3A3A5A" } },
          }
        };

        // Sobrescreve o estilo da célula se for "FALTA ABONAR" (prioridade)
        if (className === 'falta-abonar') {
          cellStyle.font = { color: { rgb: "FFFFFF" }, bold: true }; // Texto branco e negrito
          cellStyle.fill = { fgColor: { rgb: "800080" } }; // Roxo
        }

        ws[cellRef].s = cellStyle; // Aplica o estilo à célula
        ws[cellRef].v = content; // Garante que o conteúdo formatado seja o valor da célula
        ws[cellRef].t = 's'; // Garante que o Excel trate como texto
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