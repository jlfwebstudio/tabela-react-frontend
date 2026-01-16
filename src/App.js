// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter, faSortUp, faSortDown, faFileExcel, faFileUpload, faSearch } from '@fortawesome/free-solid-svg-icons'; // Adicionado faSearch
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
  const [searchTerm, setSearchTerm] = useState(''); // NOVO ESTADO PARA O TERMO DE PESQUISA

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

  // Efeito para calcular o contador de OSs em atraso (AGORA CONTA TODOS OS ATRASADOS)
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

          // CONTA TODOS OS CHAMADOS COM DATA LIMITE < DATA DE AGORA
          return dataLimite < today;
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
    setSearchTerm(''); // Limpa o termo de pesquisa ao carregar novo arquivo

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
      } else if (header === 'Data Limite') {
        value = formatDataLimite(value);
      } else if (header === 'CNPJ / CPF') {
        value = formatCnpjCpf(value);
      }
      values.add(value === '' ? '(Vazio)' : value);
    });
    return Array.from(values).sort((a, b) => {
      if (a === '(Vazio)') return 1;
      if (b === '(Vazio)') return -1;
      return String(a).localeCompare(String(b));
    });
  }, [data, normalizeStatusValue, formatDataLimite, formatCnpjCpf]);

  // Lógica de filtragem principal
  useEffect(() => {
    let currentFilteredData = [...data];

    // 1. Aplicar filtros de coluna
    Object.keys(activeFilters).forEach(header => {
      const selectedValues = Object.keys(activeFilters[header]).filter(key => activeFilters[header][key]);
      if (selectedValues.length > 0) {
        currentFilteredData = currentFilteredData.filter(row => {
          let rowValue = row[header];
          if (header === 'Status') {
            rowValue = normalizeStatusValue(rowValue);
          } else if (header === 'Data Limite') {
            rowValue = formatDataLimite(rowValue);
          } else if (header === 'CNPJ / CPF') {
            rowValue = formatCnpjCpf(rowValue);
          }
          const displayValue = rowValue === '' ? '(Vazio)' : rowValue;
          return selectedValues.includes(displayValue);
        });
      }
    });

    // 2. Aplicar pesquisa global (searchTerm)
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentFilteredData = currentFilteredData.filter(row =>
        tableHeaders.some(header => {
          let cellValue = row[header];
          if (header === 'Status') {
            cellValue = normalizeStatusValue(cellValue);
          } else if (header === 'Data Limite') {
            cellValue = formatDataLimite(cellValue);
          } else if (header === 'CNPJ / CPF') {
            cellValue = formatCnpjCpf(cellValue);
          }
          return normalizeForComparison(String(cellValue)).includes(normalizedSearchTerm);
        })
      );
    }

    // 3. Aplicar ordenação
    if (sortConfig.key) {
      currentFilteredData.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Tratamento especial para Data Limite
        if (sortConfig.key === 'Data Limite') {
          const parseDate = (dateString) => {
            const parts = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})/);
            return parts ? new Date(`${parts[2]}/${parts[1]}/${parts[3]}`) : new Date(0); // Retorna uma data inválida para falhas
          };
          aValue = parseDate(formatDataLimite(aValue));
          bValue = parseDate(formatDataLimite(bValue));
        } else if (sortConfig.key === 'CNPJ / CPF') {
          aValue = formatCnpjCpf(aValue);
          bValue = formatCnpjCpf(bValue);
        } else if (sortConfig.key === 'Status') {
          aValue = normalizeStatusValue(aValue);
          bValue = normalizeStatusValue(bValue);
        }

        if (aValue === null || aValue === undefined) aValue = '';
        if (bValue === null || bValue === undefined) bValue = '';

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'ascending'
            ? aValue.localeCompare(bValue, 'pt-BR', { numeric: true })
            : bValue.localeCompare(aValue, 'pt-BR', { numeric: true });
        } else {
          return sortConfig.direction === 'ascending'
            ? (aValue > bValue ? 1 : -1)
            : (bValue > aValue ? 1 : -1);
        }
      });
    }

    setFilteredData(currentFilteredData);
  }, [data, activeFilters, sortConfig, searchTerm, normalizeForComparison, normalizeStatusValue, formatDataLimite, formatCnpjCpf, tableHeaders]); // Adicionado searchTerm e tableHeaders como dependências

  // Função para alternar o dropdown de filtro
  const toggleFilterDropdown = useCallback((header, event) => {
    if (openDropdown === header) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(header);
      const iconRect = event.currentTarget.getBoundingClientRect();
      setFilterDropdownPosition({
        top: iconRect.bottom + window.scrollY + 5,
        left: iconRect.left + window.scrollX,
      });
    }
  }, [openDropdown]);

  // Função para lidar com a seleção de filtros
  const handleFilterSelectionChange = useCallback((value) => {
    setFilterSelections(prev => ({
      ...prev,
      [value]: !prev[value]
    }));
  }, []);

  // Função para aplicar os filtros
  const applyFilters = useCallback((header) => {
    const newActiveFilters = { ...activeFilters };
    newActiveFilters[header] = { ...filterSelections };
    setActiveFilters(newActiveFilters);
    setOpenDropdown(null);
  }, [activeFilters, filterSelections]);

  // Função para limpar os filtros de uma coluna
  const clearFilters = useCallback((header) => {
    const newActiveFilters = { ...activeFilters };
    delete newActiveFilters[header];
    setActiveFilters(newActiveFilters);
    setFilterSelections({}); // Limpa as seleções do dropdown atual
    setOpenDropdown(null);
  }, [activeFilters]);

  // Função para selecionar/desmarcar todos os filtros de uma coluna
  const toggleSelectAll = useCallback((header, selectAll) => {
    const uniqueValues = getUniqueColumnValues(header);
    const newSelections = {};
    uniqueValues.forEach(value => {
      newSelections[value] = selectAll;
    });
    setFilterSelections(newSelections);
  }, [getUniqueColumnValues]);

  // Função para solicitar ordenação
  const requestSort = useCallback((key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  // Função para obter o nome da classe da linha com base na Data Limite
  const getRowClassByDataLimite = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    if (!dataLimiteStr) return '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (parts) {
        const [, day, month, year] = parts;
        const dataLimite = new Date(`${month}/${day}/${year}`);
        dataLimite.setHours(0, 0, 0, 0);

        if (dataLimite < today) {
          return 'overdue-strong'; // Vermelho forte para atrasados
        } else if (dataLimite.getTime() === today.getTime()) {
          return 'due-today'; // Amarelo para hoje
        }
      }
    } catch (e) {
      console.error("Erro ao comparar data limite para classe da linha:", dataLimiteStr, e);
    }
    return ''; // Nenhuma classe especial para datas futuras
  }, []);

  // Função para obter o conteúdo da célula e a classe (para "FALTA ABONAR")
  const getCellContentAndClassName = useCallback((row, header) => {
    let content = row[header];
    let className = '';

    if (header === 'Status') {
      content = normalizeStatusValue(content);
    } else if (header === 'Data Limite') {
      content = formatDataLimite(content);
    } else if (header === 'CNPJ / CPF') {
      content = formatCnpjCpf(content);
    }

    // Lógica para "FALTA ABONAR"
    if (header === 'Justificativa do Abono') {
      const dataLimiteStr = row['Data Limite'];
      const justificativa = row['Justificativa do Abono'];

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      try {
        const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (parts) {
          const [, day, month, year] = parts;
          const dataLimite = new Date(`${month}/${day}/${year}`);
          dataLimite.setHours(0, 0, 0, 0);

          if (dataLimite < today && (!justificativa || justificativa.trim() === '')) {
            content = 'FALTA ABONAR';
            className = 'falta-abonar';
          }
        }
      } catch (e) {
        console.error("Erro ao verificar 'FALTA ABONAR':", dataLimiteStr, e);
      }
    }

    // Adiciona classes de largura de coluna
    if (header === 'Numero Referencia') className += ' col-numero-referencia';
    if (header === 'CNPJ / CPF') className += ' col-cnpj-cpf';
    if (header === 'Cidade') className += ' col-cidade';
    if (header === 'Serviço') className += ' col-servico';
    if (header === 'Técnico') className += ' col-tecnico';
    if (header === 'Justificativa do Abono') className += ' col-justificativa';

    return { content, className: className.trim() };
  }, [normalizeStatusValue, formatDataLimite, formatCnpjCpf]);

  // Função genérica para exportar dados para Excel
  const exportDataToExcel = useCallback((dataToExport, filename) => {
    if (dataToExport.length === 0) {
      alert('Nenhum dado para exportar.');
      return;
    }

    const ws = XLSX.utils.aoa_to_sheet([tableHeaders, ...dataToExport.map(row => tableHeaders.map(header => {
      const { content } = getCellContentAndClassName(row, header);
      return content;
    }))]);

    // Aplica estilos de cabeçalho
    const headerStyle = {
      fill: { fgColor: { rgb: "4472C4" } }, // Azul escuro
      font: { color: { rgb: "FFFFFF" }, bold: true },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } }
      }
    };
    tableHeaders.forEach((_, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = headerStyle;
    });

    // Aplica estilos de linha e célula
    dataToExport.forEach((row, rowIndex) => {
      const rowClass = getRowClassByDataLimite(row);
      let fillColor = null;
      let textColor = null;

      if (rowClass === 'overdue-strong') {
        fillColor = { rgb: "FF0000" }; // Vermelho forte
        textColor = { rgb: "FFFFFF" };
      } else if (rowClass === 'due-today') {
        fillColor = { rgb: "FFFF00" }; // Amarelo
        textColor = { rgb: "000000" };
      }

      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
        if (!ws[cellRef]) ws[cellRef] = {};

        const { content, className } = getCellContentAndClassName(row, header);

        // Estilo para "FALTA ABONAR" (prioridade)
        if (className.includes('falta-abonar')) {
          ws[cellRef].s = {
            fill: { fgColor: { rgb: "800080" } }, // Roxo
            font: { color: { rgb: "FFFFFF" }, bold: true },
            alignment: { horizontal: "center", vertical: "center" },
            border: {
              top: { style: "thin", color: { rgb: "000000" } },
              bottom: { style: "thin", color: { rgb: "000000" } },
              left: { style: "thin", color: { rgb: "000000" } },
              right: { style: "thin", color: { rgb: "000000" } }
            }
          };
        } else if (fillColor) { // Estilo de linha (se não for "FALTA ABONAR")
          ws[cellRef].s = {
            fill: { fgColor: fillColor },
            font: { color: textColor },
            border: {
              top: { style: "thin", color: { rgb: "000000" } },
              bottom: { style: "thin", color: { rgb: "000000" } },
              left: { style: "thin", color: { rgb: "000000" } },
              right: { style: "thin", color: { rgb: "000000" } }
            }
          };
        } else { // Estilo padrão para linhas não coloridas
          ws[cellRef].s = {
            fill: { fgColor: { rgb: (rowIndex % 2 === 0) ? "FFFFFF" : "F0F0F0" } }, // Fundo branco ou cinza claro
            font: { color: { rgb: "333333" } }, // Texto cinza escuro
            border: {
              top: { style: "thin", color: { rgb: "000000" } },
              bottom: { style: "thin", color: { rgb: "000000" } },
              left: { style: "thin", color: { rgb: "000000" } },
              right: { style: "thin", color: { rgb: "000000" } }
            }
          };
        }
      });
    });

    // Ajusta a largura das colunas automaticamente
    const colWidths = tableHeaders.map((header, i) => {
      const maxLength = Math.max(
        header.length,
        ...dataToExport.map(row => String(tableHeaders.map(h => getCellContentAndClassName(row, h).content)[i]).length)
      );
      return { wch: maxLength + 2 }; // Adiciona um pouco de padding
    });
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), filename);
  }, [tableHeaders, getCellContentAndClassName, getRowClassByDataLimite]);

  // Função para exportar apenas as pendências do dia
  const handleExportPendingToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pendingData = filteredData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      if (!dataLimiteStr) return false;

      try {
        const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (parts) {
          const [, day, month, year] = parts;
          const dataLimite = new Date(`${month}/${day}/${year}`);
          dataLimite.setHours(0, 0, 0, 0);

          // Inclui se a data limite é menor ou igual à data de hoje
          return dataLimite <= today;
        }
      } catch (e) {
        console.error("Erro ao comparar data limite para exportação de pendências:", dataLimiteStr, e);
      }
      return false;
    });

    if (pendingData.length === 0) {
      alert('Nenhum registro encontrado que atenda ao critério de “pendências do dia” (itens com data de limite vencida ou com vencimento para a data atual).');
      return;
    }

    exportDataToExcel(pendingData, 'pendencias_do_dia.xlsx');
  }, [filteredData, exportDataToExcel]);


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
            <>
              <button onClick={() => exportDataToExcel(filteredData, 'tabela_completa.xlsx')} className="export-button">
                <FontAwesomeIcon icon={faFileExcel} /> Exportar Tabela Completa
              </button>
              <button onClick={handleExportPendingToExcel} className="export-button">
                <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendências do Dia
              </button>
            </>
          )}
          {overdueCount > 0 && (
            <div className="overdue-count">
              OSs em Atraso: {overdueCount}
            </div>
          )}
        </div>

        {/* NOVO CAMPO DE PESQUISA GLOBAL */}
        {data.length > 0 && (
          <div className="search-bar-container">
            <FontAwesomeIcon icon={faSearch} className="search-icon" />
            <input
              type="text"
              placeholder="Pesquisar em toda a tabela..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="global-search-input"
            />
          </div>
        )}
      </header>

      {loading && <div className="loading-message">Carregando...</div>}
      {error && <div className="error-message">{error}</div>}

      {data.length > 0 && (
        <div className="data-table-container" translate="no">
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
